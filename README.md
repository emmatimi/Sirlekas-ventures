# Newsletter email configuration

The blog newsletter uses the server-side `/api/newsletter/subscribe` route and Nodemailer. Configure these environment variables in the deployment environment (never expose them with a `VITE_` prefix):

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=newsletter@sirlekasventures.com
FIREBASE_SERVICE_ACCOUNT=<JSON or base64-encoded service account JSON>
```
