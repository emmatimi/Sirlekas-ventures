const crypto = require("crypto");
const admin = require("firebase-admin");

module.exports.config = {
  api: { bodyParser: false },
};

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    console.warn("FIREBASE_SERVICE_ACCOUNT not set; webhook will not write to Firestore");
  } else {
    try {
      const serviceAccount = JSON.parse(Buffer.from(sa, "base64").toString("utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error("Failed to initialize Firebase Admin:", e?.message || e);
    }
  }
}

module.exports = async function handler(req, res) {
  console.log("🔥 WEBHOOK HIT", req.method);

  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const MONNIFY_WEBHOOK_SECRET = process.env.MONNIFY_WEBHOOK_SECRET;
    if (!MONNIFY_WEBHOOK_SECRET) {
      console.error("Missing MONNIFY_WEBHOOK_SECRET");
      return res.status(500).send("Server misconfigured");
    }

    const rawBody = await getRawBody(req);

    const signature = req.headers["monnify-signature"];
    const computedSignature = crypto
      .createHmac("sha512", MONNIFY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (!signature || signature !== computedSignature) {
      console.error("Invalid Monnify webhook signature");
      return res.status(401).send("Unauthorized");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const { eventType, eventData } = payload || {};

    console.log("Webhook event:", eventType, eventData?.paymentStatus);

    if (eventType !== "SUCCESSFUL_TRANSACTION" || eventData?.paymentStatus !== "PAID") {
      return res.status(200).send("Ignored");
    }

    const { paymentReference, amountPaid, customer, metaData } = eventData || {};
    const { userId, examType, subject, type } = metaData || {};

    if (!userId || !type) {
      console.warn("Webhook missing metadata", metaData);
      return res.status(200).send("Invalid metadata");
    }

    if (!admin.apps.length) {
      console.error("Firebase Admin not initialized");
      return res.status(500).send("Server misconfigured");
    }

    const db = admin.firestore();
    const txRef = db.collection("transactions").doc(paymentReference);
    const userRef = db.collection("users").doc(userId);

    // FIX 1 (duplicate guard): still use the dedicated transactions collection
    // as the idempotency lock — this is correct and stays unchanged.
    const existingTx = await txRef.get();
    if (existingTx.exists) {
      console.log("Duplicate transaction:", paymentReference);
      return res.status(200).send("Duplicate");
    }

    const paidAmount = Number(amountPaid);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      console.warn("Invalid paid amount:", amountPaid);
      return res.status(200).send("Invalid amount");
    }

    const userDoc = await userRef.get();
    const pending = userDoc.data()?.pendingTransaction;

    // FIX 2 (stale pending guard): instead of hard-rejecting on mismatch,
    // log a warning but still process if the top-level idempotency check
    // (existingTx above) already passed. The real guard against double-credit
    // is the transactions collection doc — not the pendingTransaction field.
    if (!pending) {
      console.warn("No pendingTransaction field found for user", userId, "— proceeding anyway (already passed idempotency check)");
    } else if (pending.reference !== paymentReference) {
      console.warn("pendingTransaction reference mismatch — stale pending. Continuing with webhook reference:", paymentReference);
    } else if (Number(pending.amount) !== paidAmount) {
      console.warn("pendingTransaction amount mismatch (pending:", pending.amount, "paid:", paidAmount, ") — continuing");
    }

    await db.runTransaction(async (t) => {
      // Write the canonical transaction record (idempotency lock)
      t.set(txRef, {
        reference: paymentReference,
        monnifyTransactionReference: eventData.transactionReference,
        status: "SUCCESS",
        amount: paidAmount,
        userId,
        examType: examType || null,
        subject: subject || null,
        type,
        paymentMethod: eventData.paymentMethod || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (type === "WALLET_FUND") {
        t.update(userRef, {
          walletBalance: admin.firestore.FieldValue.increment(paidAmount),
          pendingTransaction: admin.firestore.FieldValue.delete(),
        });
      } else {
        // FIX 3 (course key separator): use underscore to match dbService.ts
        // and StudentDashboard.tsx which both use `${examType}_${subject}`
        const courseKey = `${examType}_${subject}`;
        t.update(userRef, {
          purchasedCourses: admin.firestore.FieldValue.arrayUnion(courseKey),
          pendingTransaction: admin.firestore.FieldValue.delete(),
        });
      }

      // FIX 4 (transaction history): update the status of the matching entry
      // in the user's embedded transactions array so the dashboard reflects SUCCESS
      const userData = userDoc.data() || {};
      const embeddedTxs = Array.isArray(userData.transactions) ? userData.transactions : [];
      const updatedTxs = embeddedTxs.map((tx) =>
        tx.reference === paymentReference ? { ...tx, status: "SUCCESS" } : tx
      );
      // Only write if there was actually a matching entry to update
      if (updatedTxs.some((tx) => tx.reference === paymentReference && tx.status === "SUCCESS")) {
        t.update(userRef, { transactions: updatedTxs });
      }
    });

    // FIX 5 (email guard): fall back to metaData.email if customer object is missing
    try {
      const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
      const EMAILJS_RECEIPT_TEMPLATE_ID = process.env.EMAILJS_RECEIPT_TEMPLATE_ID;
      const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

      const recipientEmail = customer?.email || metaData?.email || null;

      if (EMAILJS_SERVICE_ID && EMAILJS_RECEIPT_TEMPLATE_ID && EMAILJS_PUBLIC_KEY && recipientEmail) {
        await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_RECEIPT_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
              to_name: customer?.name || metaData?.email?.split("@")[0] || "Customer",
              to_email: recipientEmail,
              transaction_type: type,
              item_name:
                type === "WALLET_FUND"
                  ? "Wallet Funding"
                  : `${subject} (${examType})`,
              amount: paidAmount,
              reference: paymentReference,
              date: new Date().toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              }),
            },
          }),
        });
      } else if (!recipientEmail) {
        console.warn("EmailJS skipped: no recipient email available");
      }
    } catch (emailErr) {
      console.error("EmailJS error:", emailErr?.message || emailErr);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err?.message || err);
    return res.status(500).send("Server Error");
  }
};
