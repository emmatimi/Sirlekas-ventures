import { createRequire } from "module";

const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;
const require = createRequire(import.meta.url);
const {
  initializeAdmin,
  verifyFirebaseUser,
  getCoursePrice,
} = require("./_payment-admin.cjs");

function getMonnifyOrigin() {
  return String(MONNIFY_BASE_URL || "")
    .replace(/\/+$/, "")
    .replace(/\/api\/v\d+$/i, "");
}

function monnifyUrl(path) {
  return `${getMonnifyOrigin()}${path}`;
}

/**
 * Get Monnify access token
 */
async function getMonnifyToken(apiKey, secretKey) {
  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const resp = await fetch(monnifyUrl("/api/v1/auth/login"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  const data = await resp.json();

  const token = data?.responseBody?.accessToken;

  if (!token) {
    console.error("Monnify auth failed:", data);
    throw new Error("Failed to obtain Monnify access token");
  }

  return token;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { userId, examType, subject, email, amount } = body || {};

    const decodedUser = await verifyFirebaseUser(req);

    if (!userId || decodedUser.uid !== userId) {
      return res.status(403).json({
        error: "Cannot initialize payment for another user",
      });
    }

    if (!email || decodedUser.email !== email) {
      return res.status(400).json({
        error: "Payment email must match the signed-in account",
      });
    }

    const transactionType =
      examType === "WALLET_FUND" ? "WALLET_FUND" : "COURSE_UNLOCK";

    if (transactionType === "COURSE_UNLOCK" && (!examType || !subject)) {
      return res.status(400).json({
        error: "Missing required fields (examType, subject)",
      });
    }

    const requestedAmount = Number(amount);

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const {
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY,
      MONNIFY_CONTRACT_CODE,
      APP_URL,
    } = process.env;

    if (
      !getMonnifyOrigin() ||
      !MONNIFY_API_KEY ||
      !MONNIFY_SECRET_KEY ||
      !MONNIFY_CONTRACT_CODE
    ) {
      return res.status(500).json({
        error: "Monnify environment variables not configured",
      });
    }

    const admin = initializeAdmin();
    const db = admin.firestore();
    const numericAmount =
      transactionType === "COURSE_UNLOCK"
        ? await getCoursePrice(db, examType, subject)
        : requestedAmount;

    const localReference = `SIRL-${
      transactionType === "WALLET_FUND" ? "WALLET" : "COURSE"
    }-${Date.now()}-${String(userId).slice(0, 6)}`;

    const token = await getMonnifyToken(MONNIFY_API_KEY, MONNIFY_SECRET_KEY);

    const paymentPayload = {
      amount: numericAmount,
      currencyCode: "NGN",
      contractCode: MONNIFY_CONTRACT_CODE,
      paymentReference: localReference,
      paymentDescription:
        transactionType === "WALLET_FUND"
          ? "Wallet Funding - Sirlekas"
          : `Unlock ${subject || "Course"}`,
      customerName: email.split("@")[0],
      customerEmail: email,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
      redirectUrl: `${APP_URL || req.headers.origin || ""}/dashboard?paymentReference=${encodeURIComponent(localReference)}`,
      metaData: {
        userId,
        examType: transactionType === "WALLET_FUND" ? null : examType,
        subject: transactionType === "WALLET_FUND" ? null : subject,
        amount: numericAmount,
        type: transactionType,
        email,
      },
    };

    const initResp = await fetch(
      monnifyUrl("/api/v1/merchant/transactions/init-transaction"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(paymentPayload),
      }
    );

    const initData = await initResp.json();

    const checkoutUrl = initData?.responseBody?.checkoutUrl;
    const paymentReference = initData?.responseBody?.paymentReference;
    const monnifyTransactionReference =
      initData?.responseBody?.transactionReference;

    if (!checkoutUrl || !paymentReference) {
      return res.status(502).json({
        error: "Invalid Monnify init response",
        monnify: initData,
      });
    }

    const userRef = db.collection("users").doc(userId);
    const pendingTransaction = {
      reference: paymentReference,
      monnifyTransactionReference,
      amount: numericAmount,
      type: transactionType,
      examType: transactionType === "COURSE_UNLOCK" ? examType : null,
      subject: transactionType === "COURSE_UNLOCK" ? subject : null,
      timestamp: Date.now(),
    };

    await userRef.set(
      {
        pendingTransaction,
        transactions: admin.firestore.FieldValue.arrayUnion({
          id: `TX-${paymentReference}`,
          reference: paymentReference,
          userId,
          category:
            transactionType === "WALLET_FUND"
              ? "WALLET_FUND"
              : "COURSE_PURCHASE",
          type: transactionType,
          item:
            transactionType === "WALLET_FUND"
              ? "Wallet Funding"
              : `${subject} (${examType})`,
          amount: numericAmount,
          status: "PENDING",
          timestamp: Date.now(),
        }),
      },
      { merge: true }
    );

    return res.status(200).json({
      checkoutUrl,
      paymentReference,
      monnifyTransactionReference,
      localReference,
    });
  } catch (error) {
    console.error("INIT ERROR:", error);

    const status = error.statusCode || 500;
    const safeMessage =
      status >= 500
        ? "Payment service is temporarily unavailable. Please contact support."
        : error.message || "Failed to initialize payment";

    return res.status(status).json({
      error: safeMessage,
    });
  }
}
