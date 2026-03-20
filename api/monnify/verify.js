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

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    console.log("BODY:", body);

    const {
      paymentReference,                
      monnifyTransactionReference,     
    } = body || {};

    if (!paymentReference && !monnifyTransactionReference) {
      return res.status(400).json({
        error: "Provide paymentReference or monnifyTransactionReference",
      });
    }

    const token = await getMonnifyToken(
      process.env.MONNIFY_API_KEY,
      process.env.MONNIFY_SECRET_KEY
    );

const params = monnifyTransactionReference
  ? { transactionReference: monnifyTransactionReference }
  : { paymentReference };
    console.log("VERIFY PARAMS:", params);

    const response = await axios.get(
      `${MONNIFY_BASE_URL}/transactions/query`,
      {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("VERIFY SUCCESS:", response.data);

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "VERIFY ERROR:",
      error.response?.data || error.message
    );

return res.status(200).json({
  status: "PENDING",
  details: error.response?.data || error.message,
});
  }
}