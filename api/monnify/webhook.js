const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already
if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT || null;
  if (!sa) {
    console.warn('No FIREBASE_SERVICE_ACCOUNT env var set; webhook cannot write to Firestore.');
  } else {
    const serviceAccount = JSON.parse(Buffer.from(sa, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const signature = req.headers['monnify-signature'];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;

    if (!MONNIFY_SECRET_KEY) {
      console.error('Missing MONNIFY_SECRET_KEY in env for webhook signature check');
      return res.status(500).send('Server misconfigured');
    }

    const computed = crypto.createHmac('sha512', MONNIFY_SECRET_KEY).update(rawBody).digest('hex');
    if (!signature || computed !== signature) {
      console.error('Invalid Webhook Signature');
      return res.status(401).send('Unauthorized');
    }

    const { eventType, eventData } = req.body;

    if (eventType === 'SUCCESSFUL_TRANSACTION' && eventData.paymentStatus === 'PAID') {
      const { paymentReference, amountPaid, customer, metaData } = eventData;
      const { userId, examType, subject } = metaData || {};

      if (!userId || !examType || !subject) {
        console.warn('Webhook missing metadata');
        return res.status(200).send('Invalid metadata');
      }

      if (!admin.apps.length) {
        console.error('Firebase Admin not initialized; cannot grant access');
        return res.status(500).send('Server misconfigured');
      }

      const txRef = admin.firestore().collection('transactions').doc(paymentReference);
      const txSnap = await txRef.get();
      if (txSnap.exists) {
        console.log('Duplicate transaction:', paymentReference);
        return res.status(200).send('Duplicate');
      }

      // Amount check
      if (parseFloat(amountPaid) < 300) {
        console.warn('Underpayment', amountPaid);
        return res.status(200).send('Underpaid');
      }

      const courseKey = `${examType}-${subject}`;
      const userRef = admin.firestore().collection('users').doc(userId);

      await admin.firestore().runTransaction(async (transaction) => {
        transaction.set(txRef, {
          status: 'SUCCESS',
          amount: amountPaid,
          userId,
          examType,
          subject,
          reference: paymentReference,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(userRef, {
          purchasedCourses: admin.firestore.FieldValue.arrayUnion(courseKey)
        });
      });

      // Optional: send email via EmailJS (if configured)
      try {
        const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
        const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
        const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
        if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
          await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
              to_name: customer.name,
              to_email: customer.email,
              transaction_type: 'COURSE_UNLOCK',
              item_name: `${subject} (${examType})`,
              amount: amountPaid,
              reference: paymentReference,
              date: new Date().toLocaleDateString()
            }
          });
        }
      } catch (e) {
        console.error('EmailJS send error', e?.message || e);
      }

      return res.status(200).send('OK');
    }

    res.status(200).send('Ignored');
  } catch (err) {
    console.error('webhook handler error', err?.message || err);
    res.status(500).send('Server Error');
  }
};
