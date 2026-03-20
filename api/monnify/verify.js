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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { paymentReference, monnifyTransactionReference } = body || {};

    if (!paymentReference && !monnifyTransactionReference) {
      return res.status(400).json({
        error: "Provide paymentReference or monnifyTransactionReference",
      });
    }

    const token = await getMonnifyToken(
      process.env.MONNIFY_API_KEY,
      process.env.MONNIFY_SECRET_KEY
    );

    /**
     * FIX: Monnify sometimes requires the transactionReference (MNFY|...) 
     * if the internal paymentReference (SIRL-...) isn't yet indexed 
     * in the query API.
     */
    const params = {};
    if (monnifyTransactionReference) {
      params.transactionReference = monnifyTransactionReference;
    } else {
      params.paymentReference = paymentReference;
    }

    console.log("VERIFYING WITH PARAMS:", params);

    const response = await axios.get(
      `${MONNIFY_BASE_URL}/transactions/query`,
      {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    const errorData = error.response?.data;
    console.error("VERIFY ERROR:", errorData || error.message);

    // If Monnify explicitly says "not found", return a 404-style status 
    // so the frontend knows to retry or wait for the webhook.
    if (errorData?.responseCode === "99") {
      return res.status(200).json({
        status: "NOT_FOUND",
        responseMessage: errorData.responseMessage,
      });
    }

    return res.status(200).json({
      status: "ERROR",
      details: errorData || error.message,
    });
  }
}