import axios from 'axios';

const MONNIFY_BASE_URL = 'https://api.monnify.com/api/v1';

const axiosClient = axios.create({
  baseURL: MONNIFY_BASE_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json'
  }
});

async function getMonnifyToken(apiKey, secretKey) {
  const resp = await axiosClient.post('/auth/login', {
    username: apiKey,
    password: secretKey
  });

  const token = resp?.data?.responseBody?.accessToken;

  if (!token) {
    throw new Error('Failed to obtain Monnify access token');
  }

  return token;
}

export default async function handler(req, res) {
  try {
    // Enforce method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId, examType, subject, email, amount } = req.body ?? {};

    // Validate payload
    if (!userId || !email || !amount) {
      return res.status(400).json({
        error: 'Missing required fields (userId, email, amount)'
      });
    }

    // Validate environment
    const {
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY,
      MONNIFY_CONTRACT_CODE,
      APP_URL
    } = process.env;

    if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY || !MONNIFY_CONTRACT_CODE) {
      return res.status(500).json({
        error: 'Monnify environment variables not configured'
      });
    }

    if (!APP_URL) {
      return res.status(500).json({
        error: 'APP_URL environment variable not configured'
      });
    }

    // Generate transaction reference
    const transactionReference = `SIRL-${examType || 'GEN'}-${Date.now()}-${String(
      userId
    ).slice(0, 6)}`;

    // Authenticate with Monnify
    const token = await getMonnifyToken(
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY
    );

    // Initialize transaction
    const initResp = await axiosClient.post(
      '/merchant/transactions/init-transaction',
      {
        amount,
        currencyCode: 'NGN',
        contractCode: MONNIFY_CONTRACT_CODE,
        reference: transactionReference,
        description: `Unlock ${subject || 'item'} (${examType || 'GENERAL'}) - Sirlekas`,
        customerName: email.split('@')[0],
        customerEmail: email,
        paymentMethod: 'CARD',
        redirectUrl: `${APP_URL}/?payment=success&ref=${transactionReference}`,
        metaData: {
          userId,
          examType,
          subject
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const checkoutLink =
      initResp?.data?.responseBody?.checkoutLink;

    if (!checkoutLink) {
      return res.status(502).json({
        error: 'Monnify did not return a checkout link'
      });
    }

    return res.status(200).json({
      checkoutLink,
      transactionReference
    });

  } catch (error) {
    console.error(
      'Monnify init error:',
      error?.response?.data || error
    );

    return res.status(500).json({
      error: 'Failed to initialize payment'
    });
  }
}
