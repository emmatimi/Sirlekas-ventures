const axios = require('axios');

const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;


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

    const { transactionReference } = req.body;
    if (!transactionReference) return res.status(400).json({ error: 'Missing transactionReference' });

    const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY;
    const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;

    if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY) return res.status(500).json({ error: 'Monnify not configured' });

    const token = await getMonnifyToken(MONNIFY_API_KEY, MONNIFY_SECRET_KEY);

    const resp = await axios.get(`${MONNIFY_BASE_URL}/merchant/transactions/query`, {
      params: { reference: transactionReference },
      headers: { Authorization: `Bearer ${token}` }
    });

    const transaction = resp.data?.responseBody;
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    return res.json({ verified: transaction.paymentStatus === 'PAID', status: transaction.paymentStatus, transaction });
  } catch (err) {
    console.error('verify error', err?.response?.data || err.message || err);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
};
