import axios from "axios";

const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;

async function getMonnifyToken(apiKey, secretKey) {
  if (!MONNIFY_BASE_URL) throw new Error("MONNIFY_BASE_URL not configured");

  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const resp = await axios.post(
    `${MONNIFY_BASE_URL}/auth/login`,
    null,
    {
      headers: { Authorization: `Basic ${basic}` },
    }
  );

  const token = resp.data?.responseBody?.accessToken;
  if (!token) {
    console.error("Monnify auth response:", resp.data);
    throw new Error("Failed to obtain Monnify access token");
  }

  return token;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    console.log("BODY:", body);

    const { transactionReference } = body || {};

    console.log("REFERENCE:", transactionReference);

    if (!transactionReference) {
      return res
        .status(400)
        .json({ error: "transactionReference is required" });
    }

    const token = await getMonnifyToken(
      process.env.MONNIFY_API_KEY,
      process.env.MONNIFY_SECRET_KEY
    );

    const response = await axios.get(
      `${process.env.MONNIFY_BASE_URL}/transactions/query`,
      {
        params: {
          transactionReference, 
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("verify error", error.response?.data || error.message);
    return res.status(500).json({ error: "Verification failed" });
  }
}
