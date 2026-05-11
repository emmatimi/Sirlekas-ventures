const crypto = require("crypto");
const {
  finalizePaidTransaction,
} = require("./_payment-admin.cjs");

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

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = async function handler(req, res) {
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

    if (!timingSafeEqual(signature, computedSignature)) {
      console.error("Invalid Monnify webhook signature");
      return res.status(401).send("Unauthorized");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const { eventType, eventData } = payload || {};

    if (eventType !== "SUCCESSFUL_TRANSACTION" || eventData?.paymentStatus !== "PAID") {
      return res.status(200).send("Ignored");
    }

    const { customer, metaData } = eventData || {};
    const finalizeResult = await finalizePaidTransaction(eventData);

    if (finalizeResult?.duplicate) {
      return res.status(200).send("Duplicate");
    }

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
              transaction_type: metaData?.type,
              item_name:
                metaData?.type === "WALLET_FUND"
                  ? "Wallet Funding"
                  : `${finalizeResult?.subject || metaData?.subject} (${finalizeResult?.examType || metaData?.examType})`,
              amount: eventData.amountPaid,
              reference: eventData.paymentReference,
              date: new Date().toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
              }),
            },
          }),
        });
      }
    } catch (emailErr) {
      console.error("EmailJS error:", emailErr?.message || emailErr);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err?.message || err);
    return res.status(err.statusCode || 500).send("Server Error");
  }
};
