const admin = require("firebase-admin");

function decodeServiceAccount(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
}

function initializeAdmin() {
  if (admin.apps.length) return admin;

  const serviceAccount = decodeServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}

async function verifyFirebaseUser(req) {
  const app = initializeAdmin();
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    const err = new Error("Missing Firebase ID token");
    err.statusCode = 401;
    throw err;
  }

  try {
    return await app.auth().verifyIdToken(match[1]);
  } catch {
    const err = new Error("Invalid Firebase ID token");
    err.statusCode = 401;
    throw err;
  }
}

function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function verifyAdminUser(req) {
  const decoded = await verifyFirebaseUser(req);
  const email = decoded.email?.trim().toLowerCase();
  const adminEmails = getAdminEmails();

  if (!email || !adminEmails.includes(email)) {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    throw err;
  }

  return decoded;
}

const makeCourseKey = (examType, subject) => `${examType}_${subject}`;

async function getCoursePrice(db, examType, subject) {
  const settingsSnap = await db.collection("settings").doc("coursePrices").get();
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const prices = settings.prices || {};
  const coursePrice = Number(prices[makeCourseKey(examType, subject)]);
  const defaultPrice = Number(settings.defaultPrice);

  if (Number.isFinite(coursePrice) && coursePrice > 0) return coursePrice;
  if (Number.isFinite(defaultPrice) && defaultPrice > 0) return defaultPrice;
  return 300;
}

function normalizePaidTransaction(eventData, fallback = {}) {
  const metaData = eventData?.metaData || fallback.metaData || {};

  return {
    paymentReference:
      eventData?.paymentReference ||
      fallback.paymentReference ||
      fallback.reference,
    monnifyTransactionReference:
      eventData?.transactionReference ||
      fallback.monnifyTransactionReference ||
      null,
    amountPaid: Number(eventData?.amountPaid ?? fallback.amountPaid),
    paymentStatus: eventData?.paymentStatus || fallback.paymentStatus,
    paymentMethod: eventData?.paymentMethod || fallback.paymentMethod || null,
    userId: metaData.userId || fallback.userId,
    examType: metaData.examType || fallback.examType,
    subject: metaData.subject || fallback.subject,
    type: metaData.type || fallback.type,
    email: metaData.email || fallback.email || null,
  };
}

async function finalizePaidTransaction(rawEventData, fallback = {}) {
  const app = initializeAdmin();
  const db = app.firestore();
  const tx = normalizePaidTransaction(rawEventData, fallback);

  if (tx.paymentStatus && tx.paymentStatus !== "PAID") {
    return { finalized: false, reason: "not_paid" };
  }

  if (!tx.paymentReference || !tx.userId) {
    const err = new Error("Paid transaction is missing required metadata");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(tx.amountPaid) || tx.amountPaid <= 0) {
    const err = new Error("Paid transaction has an invalid amount");
    err.statusCode = 400;
    throw err;
  }

  const txRef = db.collection("transactions").doc(tx.paymentReference);
  const userRef = db.collection("users").doc(tx.userId);

  return db.runTransaction(async (t) => {
    const [existingTx, userDoc] = await Promise.all([t.get(txRef), t.get(userRef)]);

    if (existingTx.exists) {
      return { finalized: true, duplicate: true };
    }

    if (!userDoc.exists) {
      const err = new Error("User document not found");
      err.statusCode = 404;
      throw err;
    }

    const userData = userDoc.data() || {};
    const pending = userData.pendingTransaction;

    if (!pending || pending.reference !== tx.paymentReference) {
      const err = new Error("Pending transaction does not match this payment");
      err.statusCode = 409;
      throw err;
    }

    const transactionType = tx.type || pending.type;

    if (!transactionType) {
      const err = new Error("Paid transaction is missing a transaction type");
      err.statusCode = 409;
      throw err;
    }

    if (pending.type !== transactionType) {
      const err = new Error("Pending transaction type mismatch");
      err.statusCode = 409;
      throw err;
    }

    if (Math.round(Number(pending.amount) * 100) !== Math.round(tx.amountPaid * 100)) {
      const err = new Error("Paid amount does not match pending transaction");
      err.statusCode = 409;
      throw err;
    }

    const update = {
      pendingTransaction: app.firestore.FieldValue.delete(),
    };

    if (transactionType === "WALLET_FUND") {
      update.walletBalance = app.firestore.FieldValue.increment(tx.amountPaid);
    } else if (transactionType === "COURSE_UNLOCK") {
      if (!pending.examType || !pending.subject) {
        const err = new Error("Course unlock metadata is incomplete");
        err.statusCode = 409;
        throw err;
      }
      update.purchasedCourses = app.firestore.FieldValue.arrayUnion(
        makeCourseKey(pending.examType, pending.subject)
      );
    } else {
      const err = new Error("Unsupported transaction type");
      err.statusCode = 400;
      throw err;
    }

    const embeddedTxs = Array.isArray(userData.transactions) ? userData.transactions : [];
    update.transactions = embeddedTxs.map((item) =>
      item.reference === tx.paymentReference
        ? { ...item, status: "SUCCESS", completedAt: Date.now() }
        : item
    );

    t.set(txRef, {
      reference: tx.paymentReference,
      monnifyTransactionReference: tx.monnifyTransactionReference,
      status: "SUCCESS",
      amount: tx.amountPaid,
      userId: tx.userId,
      examType: pending.examType || tx.examType || null,
      subject: pending.subject || tx.subject || null,
      type: transactionType,
      paymentMethod: tx.paymentMethod,
      email: tx.email,
      timestamp: app.firestore.FieldValue.serverTimestamp(),
    });

    t.update(userRef, update);

    return {
      finalized: true,
      type: transactionType,
      examType: pending.examType || tx.examType || null,
      subject: pending.subject || tx.subject || null,
    };
  });
}

module.exports = {
  initializeAdmin,
  verifyFirebaseUser,
  verifyAdminUser,
  getCoursePrice,
  makeCourseKey,
  finalizePaidTransaction,
};
