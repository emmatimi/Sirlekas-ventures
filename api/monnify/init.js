const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;

/**
 * Get Monnify access token
 */
async function getMonnifyToken(apiKey, secretKey) {
  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const resp = await fetch(`${MONNIFY_BASE_URL}/auth/login`, {
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

    // FIX 1: use == null instead of ! so numeric userId values like 0 are accepted
    if (userId == null || userId === "" || !email || !amount) {
      return res.status(400).json({
        error: "Missing required fields (userId, email, amount)",
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const {
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY,
      MONNIFY_CONTRACT_CODE,
      APP_URL,
    } = process.env;

    if (
      !MONNIFY_BASE_URL ||
      !MONNIFY_API_KEY ||
      !MONNIFY_SECRET_KEY ||
      !MONNIFY_CONTRACT_CODE
    ) {
      return res.status(500).json({
        error: "Monnify environment variables not configured",
      });
    }

    const localReference = `SIRL-${
      examType === "WALLET_FUND" ? "WALLET" : "COURSE"
    }-${Date.now()}-${String(userId).slice(0, 6)}`;

    const token = await getMonnifyToken(MONNIFY_API_KEY, MONNIFY_SECRET_KEY);

    const transactionType =
      examType === "WALLET_FUND" ? "WALLET_FUND" : "COURSE_UNLOCK";

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
      redirectUrl: `${APP_URL}/dashboard`,
      // FIX 2: include email in metaData so the webhook can use it if the
      // customer object is missing from the Monnify callback payload
      metaData: {
        userId,
        examType,
        subject,
        amount: numericAmount,
        type: transactionType,
        email,
      },
    };

    console.log("INIT PAYLOAD:", paymentPayload);

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

    console.log("INIT RESPONSE:", initData);

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

    return res.status(200).json({
      checkoutUrl,
      paymentReference,
      monnifyTransactionReference,
      localReference,
    });
  } catch (error) {
    console.error("INIT ERROR:", error);

    return res.status(500).json({
      error: error.message || "Failed to initialize payment",
    });
  }
}
