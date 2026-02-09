
/**
 * CONCEPTUAL BACKEND CODE (Firebase Cloud Functions)
 * This logic handles the production security requirements.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');

admin.initializeApp();

const MONNIFY_SECRET_KEY = functions.config().monnify.secret;
const MONNIFY_API_KEY = functions.config().monnify.api_key;
const MONNIFY_CONTRACT_CODE = functions.config().monnify.contract_code;
const MONNIFY_BASE_URL = 'https://api.monnify.com/api/v1';
const EMAILJS_SERVICE_ID = functions.config().emailjs.service;
const EMAILJS_TEMPLATE_ID = functions.config().emailjs.template;
const EMAILJS_PUBLIC_KEY = functions.config().emailjs.public_key;

/**
 * Endpoint for Monnify Webhook
 */
exports.monnifyWebhook = functions.https.onRequest(async (req, res) => {
  // 1. Verify Monnify Signature (Production Security)
  const signature = req.headers['monnify-signature'];
  const requestBody = JSON.stringify(req.body);
  const computedHash = crypto.createHmac('sha512', MONNIFY_SECRET_KEY).update(requestBody).digest('hex');

  if (signature !== computedHash) {
    console.error("Invalid Webhook Signature");
    return res.status(401).send("Unauthorized");
  }

  const { eventType, eventData } = req.body;

  // 2. Handle successful payment
  if (eventType === 'SUCCESSFUL_TRANSACTION' && eventData.paymentStatus === 'PAID') {
    const { paymentReference, amountPaid, customer, metaData } = eventData;
    const { userId, examType, subject } = metaData;

    // Verify required fields
    if (!userId || !examType || !subject) {
      console.warn('Invalid metadata in webhook:', metaData);
      return res.status(200).send("Invalid Transaction");
    }

    // 3. Idempotency Check (Prevent duplicate processing)
    const txRef = admin.firestore().collection('transactions').doc(paymentReference);
    const txSnap = await txRef.get();
    
    if (txSnap.exists()) {
      console.log('Duplicate transaction detected:', paymentReference);
      return res.status(200).send("Duplicate Processed");
    }

    // 4. Verification Check (Verify amount - minimum ₦300 for course)
    if (parseFloat(amountPaid) < 300) {
      console.warn("Underpayment received:", amountPaid);
      return res.status(200).send("Underpaid");
    }

    // 5. Grant Course Access Automatically
    const courseKey = `${examType}-${subject}`;
    const userRef = admin.firestore().collection('users').doc(userId);
    
    try {
      await admin.firestore().runTransaction(async (transaction) => {
        // Record the successful transaction
        transaction.set(txRef, {
          status: 'SUCCESS',
          amount: amountPaid,
          userId: userId,
          examType: examType,
          subject: subject,
          reference: paymentReference,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Grant course access
        transaction.update(userRef, {
          purchasedCourses: admin.firestore.FieldValue.arrayUnion(courseKey)
        });
      });

      console.log(`Course access granted for user ${userId} to ${courseKey}`);

      // 6. Trigger EmailJS Notification
      try {
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
        console.log("Email Receipt Sent via EmailJS");
      } catch (e) {
        console.error("EmailJS Error:", e.message);
      }
    } catch (error) {
      console.error("Transaction Processing Error:", error.message);
      return res.status(500).send("Server Error");
    }
  }

  res.status(200).send("OK");
});

/**
 * Authenticate with Monnify and get access token
 */
const getMonnifyToken = async () => {
  try {
    const response = await axios.post(`${MONNIFY_BASE_URL}/auth/login`, {
      username: MONNIFY_API_KEY,
      password: MONNIFY_SECRET_KEY
    });
    return response.data.responseBody.accessToken;
  } catch (error) {
    console.error('Monnify Auth Error:', error.response?.data || error.message);
    throw new functions.https.HttpsError('internal', 'Failed to authenticate with Monnify');
  }
};

/**
 * Initialize Monnify Payment (Secure - Server-Side)
 * Handles authentication and transaction initialization server-side.
 * Secret key is never exposed to the client.
 */
exports.initializeMonnifyPayment = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to make a payment.');
  }

  const { userId, examType, subject, email, amount } = data;
  const authUserId = context.auth.uid;

  // Verify user ID matches authenticated user
  if (userId !== authUserId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot initiate payment for another user.');
  }

  if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY || !MONNIFY_CONTRACT_CODE) {
    console.error('Missing Monnify configuration');
    throw new functions.https.HttpsError('internal', 'Payment gateway is not properly configured.');
  }

  try {
    // Generate unique transaction reference
    const transactionRef = `SIRL-${examType}-${Date.now()}-${userId.substring(0, 4)}`;

    // Get access token from Monnify
    const token = await getMonnifyToken();

    // Initialize transaction with Monnify
    const response = await axios.post(
      `${MONNIFY_BASE_URL}/merchant/transactions/init-transaction`,
      {
        amount: amount,
        currencyCode: 'NGN',
        contractCode: MONNIFY_CONTRACT_CODE,
        reference: transactionRef,
        description: `Unlock ${subject} (${examType}) - Sirlekas`,
        customerName: email.split('@')[0],
        customerEmail: email,
        paymentMethod: 'CARD',
        redirectUrl: `${process.env.REACT_APP_URL || 'https://sirlekas.com'}/?payment=success&ref=${transactionRef}`,
        metaData: {
          userId: userId,
          examType: examType,
          subject: subject
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data.responseBody?.checkoutLink) {
      throw new Error('No checkout link in Monnify response');
    }

    // Store pending transaction in Firestore for reference
    await admin.firestore().collection('pendingTransactions').doc(transactionRef).set({
      userId: userId,
      examType: examType,
      subject: subject,
      amount: amount,
      email: email,
      reference: transactionRef,
      status: 'PENDING',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      checkoutLink: response.data.responseBody.checkoutLink,
      transactionReference: transactionRef
    };
  } catch (error) {
    console.error('Payment Initialization Error:', error.message);
    throw new functions.https.HttpsError('internal', 'Failed to initialize payment. Please try again.');
  }
});

/**
 * Verify Monnify Payment (Server-Side Verification)
 * Frontend can call this after redirect to verify payment status.
 */
exports.verifyMonnifyPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { transactionReference } = data;
  const userId = context.auth.uid;

  try {
    const token = await getMonnifyToken();

    // Query Monnify for transaction status
    const response = await axios.get(
      `${MONNIFY_BASE_URL}/merchant/transactions/query`,
      {
        params: {
          reference: transactionReference
        },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const transaction = response.data.responseBody;

    // Check if payment is successful
    if (transaction.paymentStatus === 'PAID') {
      // Verify the pending transaction exists and matches
      const pendingTx = await admin.firestore().collection('pendingTransactions').doc(transactionReference).get();
      
      if (!pendingTx.exists()) {
        throw new Error('Transaction not found in pending records');
      }

      const txData = pendingTx.data();
      if (txData.userId !== userId) {
        throw new Error('Transaction user mismatch');
      }

      // Course access already granted via webhook, just confirm it
      return {
        verified: true,
        message: 'Payment verified. Course access granted.',
        examType: txData.examType,
        subject: txData.subject
      };
    } else {
      return {
        verified: false,
        status: transaction.paymentStatus,
        message: 'Payment not yet completed'
      };
    }
  } catch (error) {
    console.error('Payment Verification Error:', error.message);
    throw new functions.https.HttpsError('internal', 'Failed to verify payment');
  }
});
