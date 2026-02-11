const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL;


/**
 * Authenticate with Monnify
 */
async function getMonnifyToken(apiKey, secretKey) {
  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

  const resp = await fetch(`${MONNIFY_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  const data = await resp.json();

  const token = data?.responseBody?.accessToken;
  if (!token) {
    console.error('Monnify auth response:', data);
    throw new Error('Failed to obtain Monnify access token');
  }

  return token;
}


  const data = await resp.json();

  const token = data?.responseBody?.accessToken;
  if (!token) {
    throw new Error('Failed to obtain Monnify access token');
  }

  return token;


export default async function handler(req, res) {
  try {
    // Enforce method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId, examType, subject, email, amount } = req.body || {};

    // Validate payload
    if (!userId || !email || !amount) {
      return res.status(400).json({
        error: 'Missing required fields (userId, email, amount)',
      });
    }

    // Validate environment
    const {
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY,
      MONNIFY_CONTRACT_CODE,
      APP_URL,
    } = process.env;

    if (
      !MONNIFY_API_KEY ||
      !MONNIFY_SECRET_KEY ||
      !MONNIFY_CONTRACT_CODE
    ) {
      return res.status(500).json({
        error: 'Monnify environment variables not configured',
      });
    }
    if (!MONNIFY_BASE_URL) {
      return res.status(500).json({
        error: 'MONNIFY_BASE_URL not configured',
      });
    }

    if (!APP_URL) {
      return res.status(500).json({
        error: 'APP_URL environment variable not configured',
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
    const initResp = await fetch(
      `${MONNIFY_BASE_URL}/merchant/transactions/init-transaction`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
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
            subject,
          },
        }),
      }
    );

    const initData = await initResp.json();

    const checkoutLink =
      initData?.responseBody?.checkoutLink;

    if (!checkoutLink) {
      console.error('Monnify init response:', initData);
      return res.status(502).json({
        error: 'Monnify did not return a checkout link',
      });
    }

    return res.status(200).json({
      checkoutLink,
      transactionReference,
    });
  } catch (error) {
    console.error(
      'Monnify init error:',
      error?.message || error
    );

    return res.status(500).json({
      error: 'Failed to initialize payment',
    });
  }
}
