const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;

/**
 * Authenticate with Monnify (Basic Auth)
 */
async function getMonnifyToken(apiKey, secretKey) {
  if (!MONNIFY_BASE_URL) throw new Error("MONNIFY_BASE_URL not configured");

  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const resp = await fetch(`${MONNIFY_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });

  const data = await resp.json();

  const token = data?.responseBody?.accessToken;
  if (!token) {
    console.error("Monnify auth response:", data);
    throw new Error("Failed to obtain Monnify access token");
  }

  return token;
}

export default async function handler(req, res) {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { userId, examType, subject, email, amount } = req.body || {};

    //  Validate required fields
    if (!userId || !email || !amount) {
      return res.status(400).json({
        error: "Missing required fields (userId, email, amount)",
      });
    }

    // Convert & validate amount
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const paymentType =
      examType === "WALLET_FUND" ? "WALLET_FUND" : "COURSE_UNLOCK";

    const {
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY,
      MONNIFY_CONTRACT_CODE,
      APP_URL,
    } = process.env;

    // Env validation
    if (!MONNIFY_BASE_URL) {
      return res.status(500).json({
        error: "MONNIFY_BASE_URL not configured",
      });
    }

    if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY || !MONNIFY_CONTRACT_CODE) {
      return res.status(500).json({
        error: "Monnify environment variables not configured",
      });
    }

    if (!APP_URL) {
      return res.status(500).json({
        error: "APP_URL environment variable not configured",
      });
    }

    //  Generate transaction reference
    const transactionReference = `SIRL-${examType || "GEN"}-${Date.now()}-${String(
      userId
    ).slice(0, 6)}`;

    // Get Monnify token
    const token = await getMonnifyToken(
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY
    );

    // Single clean payload (FIXED)
    const paymentPayload = {
      amount: numericAmount,
      currencyCode: "NGN",
      contractCode: MONNIFY_CONTRACT_CODE,

      paymentReference: transactionReference,
      paymentDescription:
        paymentType === "WALLET_FUND"
          ? `Wallet Funding - Sirlekas`
          : `Unlock ${subject || "item"} (${examType || "GENERAL"}) - Sirlekas`,

      customerName: String(email).split("@")[0],
      customerEmail: email,

      paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],

      redirectUrl: `${APP_URL}/dashboard?payment=success`,

      metaData: {
        userId,
        examType,
        subject,
        type: paymentType,
        amount: numericAmount,
      },
    };

    console.log("Monnify init payload:", paymentPayload);

    //  Call Monnify init API
    const initResp = await fetch(
      `${MONNIFY_BASE_URL}/merchant/transactions/init-transaction`,
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
    const paymentReference =
      initData?.responseBody?.paymentReference;
    const monnifyTransactionReference =
      initData?.responseBody?.transactionReference;

    // Handle bad response from Monnify
    if (!checkoutUrl || !paymentReference) {
      console.error("Monnify init response:", initData);
      return res.status(502).json({
        error: "Invalid Monnify init response",
        monnify: initData,
      });
    }

    //  Success
    return res.status(200).json({
      checkoutUrl,
      paymentReference,
      monnifyTransactionReference,
    });

  } catch (error) {
    console.error("Monnify init error:", error);

    return res.status(500).json({
      error: error.message || "Failed to initialize payment",
    });
  }
}