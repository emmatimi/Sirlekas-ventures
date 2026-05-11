import axios from "axios";
import { createRequire } from "module";

const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;
const require = createRequire(import.meta.url);
const {
  verifyFirebaseUser,
  finalizePaidTransaction,
} = require("./_payment-admin.cjs");

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

    const {
      userId,
      paymentReference,
      monnifyTransactionReference,
    } = body || {};

    const decodedUser = await verifyFirebaseUser(req);

    if (!userId || decodedUser.uid !== userId) {
      return res.status(403).json({
        error: "Cannot verify payment for another user",
      });
    }

    if (!paymentReference && !monnifyTransactionReference) {
      return res.status(400).json({
        error: "Provide paymentReference or monnifyTransactionReference",
      });
    }

    let token;
    try {
      token = await getMonnifyToken(
        process.env.MONNIFY_API_KEY,
        process.env.MONNIFY_SECRET_KEY
      );
    } catch (authErr) {
      // FIX 1: auth failure is a server error, NOT a PENDING status.
      // Return 503 so the dashboard retry loop can distinguish it from
      // a genuine "payment still processing" response.
      console.error("Monnify auth failed:", authErr?.response?.data || authErr.message);
      return res.status(503).json({
        status: "ERROR",
        error: "Monnify authentication failed",
        details: authErr?.response?.data || authErr.message,
      });
    }

    const params = monnifyTransactionReference
      ? { transactionReference: monnifyTransactionReference }
      : { paymentReference };

    let responseData;
    try {
      const response = await axios.get(
        `${MONNIFY_BASE_URL}/transactions/query`,
        {
          params,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      responseData = response.data;

      // FIX 2: Monnify returns HTTP 200 with requestSuccessful=false and
      // responseCode "99" when the reference doesn't exist — this happens when
      // the user closes the checkout page without paying. It is NOT a pending
      // payment. Return CANCELLED so the dashboard stops retrying immediately.
      const topLevel = responseData || {};
      const details  = topLevel.details || {};
      const isNotFound =
        topLevel.requestSuccessful === false ||
        details.requestSuccessful === false ||
        topLevel.responseCode === "99" ||
        details.responseCode === "99";

      if (isNotFound) {
        console.warn("VERIFY: transaction not found (responseCode 99) — treating as CANCELLED");
        return res.status(200).json({
          responseBody: { paymentStatus: "CANCELLED" },
          details: topLevel,
        });
      }

      // Return Monnify's actual response — dashboard reads responseBody.paymentStatus
    } catch (monnifyErr) {
      const monnifyData = monnifyErr?.response?.data;
      const httpStatus = monnifyErr?.response?.status;

      console.error("VERIFY ERROR from Monnify:", monnifyData || monnifyErr.message);

      // FIX 3: only treat as PENDING when Monnify itself says so (404 = not yet
      // recorded, which is a genuine "still processing" case).
      // Any other Monnify error (400, 401, 5xx) or a network failure is an ERROR.
      if (httpStatus === 404) {
        return res.status(200).json({
          responseBody: { paymentStatus: "PENDING" },
          details: monnifyData || monnifyErr.message,
        });
      }

      // Anything else: surface it as an error so the caller can stop retrying
      return res.status(503).json({
        status: "ERROR",
        error: "Monnify query failed",
        details: monnifyData || monnifyErr.message,
      });
    }

    const payment = responseData?.responseBody;

    if (payment?.paymentStatus === "PAID") {
      await finalizePaidTransaction(payment, {
        userId,
        paymentReference,
        monnifyTransactionReference,
        paymentStatus: "PAID",
      });
    }

    return res.status(200).json(responseData);

  } catch (err) {
    // Outermost catch: unexpected errors (JSON parse, etc.)
    console.error("VERIFY UNEXPECTED ERROR:", err.message);
    return res.status(err.statusCode || 500).json({
      status: "ERROR",
      error: err.message || "Internal server error",
    });
  }
}
