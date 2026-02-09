const axios = require('axios');

const MONNIFY_BASE_URL = 'https://api.monnify.com/api/v1';

const getMonnifyToken = async (apiKey, secret) => {
  const resp = await axios.post(`${MONNIFY_BASE_URL}/auth/login`, {
    username: apiKey,
    password: secret
  });
  return resp.data.responseBody.accessToken;
};

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { userId, examType, subject, email, amount } = req.body;
    if (!userId || !email || !amount) return res.status(400).json({ error: 'Missing required fields' });

    const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY;
    const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
    const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE;

    if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY || !MONNIFY_CONTRACT_CODE) {
      return res.status(500).json({ error: 'Monnify not configured' });
    }

    const transactionRef = `SIRL-${examType || 'GEN'}-${Date.now()}-${String(userId).slice(0,6)}`;

    const token = await getMonnifyToken(MONNIFY_API_KEY, MONNIFY_SECRET_KEY);

    const initResp = await axios.post(
      `${MONNIFY_BASE_URL}/merchant/transactions/init-transaction`,
      {
        amount,
        currencyCode: 'NGN',
        contractCode: MONNIFY_CONTRACT_CODE,
        reference: transactionRef,
        description: `Unlock ${subject || 'item'} (${examType || 'GENERAL'}) - Sirlekas`,
        customerName: (email || '').split('@')[0],
        customerEmail: email,
        paymentMethod: 'CARD',
        redirectUrl: `${process.env.APP_URL || ''}/?payment=success&ref=${transactionRef}`,
        metaData: { userId, examType, subject }
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const checkoutLink = initResp.data?.responseBody?.checkoutLink;
    if (!checkoutLink) return res.status(500).json({ error: 'No checkout link from Monnify' });

    return res.json({ checkoutLink, transactionReference: transactionRef });
  } catch (err) {
    console.error('init error', err?.response?.data || err.message || err);
    return res.status(500).json({ error: 'Failed to initialize payment' });
  }
};
