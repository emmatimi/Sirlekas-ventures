import axios from "axios";

const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;

async function getMonnifyToken(apiKey, secretKey) {
  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const resp = await axios.post(
    `${MONNIFY_BASE_URL}/auth/login`,
    {},
    {
      headers: { Authorization: `Basic ${basic}` },
    }
  );

  return resp.data.responseBody.accessToken;
}

// ... existing getMonnifyToken function ...

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { paymentReference, monnifyTransactionReference } = body || {};

    if (!paymentReference && !monnifyTransactionReference) {
      return res.status(400).json({
        error: "Missing transaction references",
      });
    }

    const token = await getMonnifyToken(
      process.env.MONNIFY_API_KEY,
      process.env.MONNIFY_SECRET_KEY
    );

    /**
     * FIX: Use monnifyTransactionReference if available. 
     * It is more reliable for direct API queries.
     */
    const params = {};
    if (monnifyTransactionReference) {
      params.transactionReference = monnifyTransactionReference;
    } else {
      params.paymentReference = paymentReference;
    }

    console.log("VERIFYING WITH:", params);

    const response = await axios.get(
      `${MONNIFY_BASE_URL}/transactions/query`,
      {
        params,
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    const errorData = error.response?.data;
    console.error("VERIFY ERROR:", errorData || error.message);

    // If Monnify returns Code 99 (Not Found), we return a 200 with a custom status
    // This prevents the frontend from crashing and allows it to keep retrying.
    if (errorData?.responseCode === "99") {
      return res.status(200).json({
        requestSuccessful: true,
        responseMessage: "Processing...",
        responseBody: { paymentStatus: "PENDING" } 
      });
    }

    return res.status(500).json({ error: "Internal Server Error" });
  }
}