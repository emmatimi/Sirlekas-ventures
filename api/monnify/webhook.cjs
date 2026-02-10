const crypto = require('crypto');
const admin = require('firebase-admin');

/**
 * Disable body parsing so we can verify Monnify signature
 */
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Read raw request body (REQUIRED for webhook signature)
 */
const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });

/**
 * Initialize Firebase Admin (once per cold start)
 */
if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    console.warn(
      'FIREBASE_SERVICE_ACCOUNT not set; webhook will not write to Firestore'
    );
  } else {
    const serviceAccount = JSON.parse(
      Buffer.from(sa, 'base64').toString('utf8')
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
    if (!MONNIFY_SECRET_KEY) {
      console.error('Missing MONNIFY_SECRET_KEY');
      return res.status(500).send('Server misconfigured');
    }

    // 🔐 Read raw body
    const rawBody = await getRawBody(req);

    // 🔐 Verify signature
    const signature = req.headers['monnify-signature'];
    const computedSignature = crypto
      .createHmac('sha512', MONNIFY_SECRET_KEY)
      .update(rawBody)
      .digest('hex');

    if (!signature || signature !== computedSignature) {
      console.error('Invalid Monnify webhook signature');
      return res.status(401).send('Unauthorized');
    }

    // Parse payload AFTER verification
    const payload = JSON.parse(rawBody.toString('utf8'));
    const { eventType, eventData } = payload;

    if (
      eventType !== 'SUCCESSFUL_TRANSACTION' ||
      eventData?.paymentStatus !== 'PAID'
    ) {
      return res.status(200).send('Ignored');
    }

    const {
      paymentReference,
      amountPaid,
      customer,
      metaData,
    } = eventData;

    const { userId, examType, subject } = metaData || {};

    if (!userId || !examType) {
      console.warn('Webhook missing metadata');
      return res.status(200).send('Invalid metadata');
    }

    if (!admin.apps.length) {
      console.error('Firebase Admin not initialized');
      return res.status(500).send('Server misconfigured');
    }

    const db = admin.firestore();
    const txRef = db.collection('transactions').doc(paymentReference);

    // Prevent duplicate processing
    const existingTx = await txRef.get();
    if (existingTx.exists) {
      console.log('Duplicate transaction:', paymentReference);
      return res.status(200).send('Duplicate');
    }

    const paidAmount = Number(amountPaid);

    // Amount validation
    if (paidAmount < 300) {
      console.warn('Underpayment detected:', amountPaid);
      return res.status(200).send('Underpaid');
    }

    const userRef = db.collection('users').doc(userId);

    // 🔒 Atomic write
    await db.runTransaction(async (transaction) => {
      // Always record transaction
      transaction.set(txRef, {
        reference: paymentReference,
        status: 'SUCCESS',
        amount: paidAmount,
        userId,
        examType,
        subject: subject || null,
        type: examType === 'WALLET_FUND' ? 'WALLET_FUND' : 'COURSE_UNLOCK',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (examType === 'WALLET_FUND') {
        // 💰 Wallet funding
        transaction.update(userRef, {
          walletBalance:
            admin.firestore.FieldValue.increment(paidAmount),
          pendingTransaction:
            admin.firestore.FieldValue.delete(),
        });
      } else {
        // 🎓 Course purchase
        const courseKey = `${examType}-${subject}`;

        transaction.update(userRef, {
          purchasedCourses:
            admin.firestore.FieldValue.arrayUnion(courseKey),
          pendingTransaction:
            admin.firestore.FieldValue.delete(),
        });
      }
    });

    // 📧 Optional EmailJS notification
    try {
      const {
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        EMAILJS_PUBLIC_KEY,
      } = process.env;

      if (
        EMAILJS_SERVICE_ID &&
        EMAILJS_TEMPLATE_ID &&
        EMAILJS_PUBLIC_KEY
      ) {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
              to_name: customer?.name || 'Customer',
              to_email: customer?.email,
              transaction_type:
                examType === 'WALLET_FUND'
                  ? 'WALLET_FUND'
                  : 'COURSE_UNLOCK',
              item_name:
                examType === 'WALLET_FUND'
                  ? 'Wallet Funding'
                  : `${subject} (${examType})`,
              amount: paidAmount,
              reference: paymentReference,
              date: new Date().toLocaleDateString(),
            },
          }),
        });
      }
    } catch (emailErr) {
      console.error(
        'EmailJS error:',
        emailErr?.message || emailErr
      );
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error(
      'Webhook handler error:',
      err?.message || err
    );
    return res.status(500).send('Server Error');
  }
};
