# Deploying Monnify Serverless APIs to Vercel

This project now includes Vercel serverless endpoints under `/api/monnify/*`:

- `api/monnify/init.js` — initialize Monnify transaction (POST)
- `api/monnify/verify.js` — verify transaction status (POST)
- `api/monnify/webhook.js` — Monnify webhook receiver (POST)

## Environment variables to set on Vercel

Go to your Vercel project → Settings → Environment Variables and add:

- `MONNIFY_API_KEY` — Monnify API Key
- `MONNIFY_SECRET_KEY` — Monnify Secret Key
- `MONNIFY_CONTRACT_CODE` — Monnify Contract Code
- `APP_URL` — Your app origin (e.g. `https://yourdomain.com`) used for redirect

For webhook to write Firestore (grant access) you should also provide a Firebase service account:

- `FIREBASE_SERVICE_ACCOUNT` — Base64 encoded JSON service account (see below)

Optional (Email receipts):
- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`
- `EMAILJS_PUBLIC_KEY`

## How to provide `FIREBASE_SERVICE_ACCOUNT`

1. In Firebase Console → Project Settings → Service accounts → Generate new private key.
2. Base64-encode the JSON file content:

```bash
cat serviceAccountKey.json | base64 | pbcopy   # macOS
cat serviceAccountKey.json | base64 > key.b64  # Linux
```

3. Add the content of `key.b64` to Vercel env var `FIREBASE_SERVICE_ACCOUNT` (set as `Encrypted` / `Production` value).

> Note: If you do not set `FIREBASE_SERVICE_ACCOUNT`, the webhook will still verify signature but will not write to Firestore. You can keep webhook processing on your existing Firebase Cloud Function if you prefer.

## Deploy to Vercel

1. Install Vercel CLI if you want to deploy from terminal:

```bash
npm i -g vercel
vercel login
vercel --prod
```

2. Or connect your GitHub repo to Vercel and push.

## After deploy

1. Copy webhook URL (e.g. `https://your-deployment.vercel.app/api/monnify/webhook`) into Monnify Dashboard → Settings → Webhooks.
2. Enable `SUCCESSFUL_TRANSACTION` event.
3. Test payment flow in app — frontend already calls `/api/monnify/init` and `/api/monnify/verify`.

## Local testing

Vercel dev server supports serverless endpoints locally:

```bash
vercel dev
```

This runs your `/api` handlers locally and you can test without deploying.

## Security Notes

- Do not commit service account JSON to the repo. Use Vercel env vars.
- Keep Monnify secret and API key in Vercel env settings, not in `.env.local` in production.
- Webhook must be verified via `monnify-signature` header; code already checks HMAC-SHA512.

If you'd like, I can:
- Add a small `vercel.json` with route definitions
- Help you create the `FIREBASE_SERVICE_ACCOUNT` base64 value and set Vercel envs
- Deploy to Vercel from this machine (if you give access/CLI setup)

Which would you like me to do next?