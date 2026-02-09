# Secure Monnify Payment Implementation - Quick Start

## ✅ What's Been Completed

Your Sirlekas payment system has been updated with **enterprise-grade security**:

### Code Changes
- ✅ `functions.js` - Secure Cloud Functions with Monnify auth server-side
- ✅ `services/paymentService.ts` - Calls Cloud Functions instead of direct API
- ✅ `pages/StudentDashboard.tsx` - Verified payment flow with webhook
- ✅ `.env.local` - Monnify credentials (no secrets exposed to client)

### Security Improvements
- ✅ Secret key kept server-side only
- ✅ HMAC-SHA512 webhook signature verification
- ✅ User authentication checks
- ✅ Idempotency (no duplicate course grants)
- ✅ Amount verification before granting access
- ✅ Transaction audit trail in Firestore

### Documentation
- ✅ `SECURE_PAYMENT_FLOW.md` - Complete architecture diagram
- ✅ `CLOUD_FUNCTIONS_DEPLOYMENT.md` - Step-by-step deployment guide  
- ✅ `PAYMENT_TROUBLESHOOTING.md` - Comprehensive troubleshooting

---

## 🚀 What You Need to Do Next

### Phase 1: Setup (15 minutes)

1. **Create functions directory structure:**
   ```bash
   mkdir -p functions
   cp functions.js functions/index.js
   ```

2. **Create `functions/package.json`:**
   ```json
   {
     "name": "sirlekas-functions",
     "version": "1.0.0",
     "engines": { "node": "18" },
     "dependencies": {
       "firebase-admin": "^11.8.0",
       "firebase-functions": "^4.4.0",
       "axios": "^1.4.0"
     }
   }
   ```

3. **Install dependencies:**
   ```bash
   cd functions
   npm install
   cd ..
   ```

### Phase 2: Configure Firebase (5 minutes)

1. **Set Monnify credentials in Firebase:**
    ```bash
    firebase functions:config:set \
       monnify.api_key="<MONNIFY_API_KEY>" \
       monnify.secret="<MONNIFY_SECRET>" \
       monnify.contract_code="<MONNIFY_CONTRACT_CODE>"
    ```

2. **Verify configuration:**
   ```bash
   firebase functions:config:get monnify
   ```
   Should show all three values are set.

### Phase 3: Deploy Functions (5 minutes)

1. **Deploy to Firebase:**
   ```bash
   firebase deploy --only functions
   ```

   Output should show:
   ```
   ✔ functions[initializeMonnifyPayment]
   ✔ functions[verifyMonnifyPayment]
   ✔ functions[monnifyWebhook]
   ```

2. **Note the webhook URL** (you'll need it next):
   ```
   https://us-central1-sirlekas-cafe.cloudfunctions.net/monnifyWebhook
   ```

### Phase 4: Configure Monnify Webhook (5 minutes)

1. **Log into Monnify Dashboard:**
   - https://app.monnify.com

2. **Go to Settings → Webhooks**

3. **Add new webhook:**
   - **Webhook URL:** `https://us-central1-sirlekas-cafe.cloudfunctions.net/monnifyWebhook`
   - **Events:** Enable `SUCCESSFUL_TRANSACTION`
   - **Save**

4. **Test webhook:**
   - Click "Test Endpoint"
   - Should get HTTP 200 response

### Phase 5: Test Payment Flow (10 minutes)

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Create a test user account** in your app

3. **Click "PAY VIA MONNIFY"**

4. **Complete test payment:**
   - Use Monnify sandbox/test credentials and follow the Monnify docs for test card details.

5. **Verify success:**
   - ✅ Redirected back to your app
   - ✅ Success message appears
   - ✅ Course appears in your purchased list
   - ✅ Transaction in Firestore: `Collections → transactions`
   - ✅ User document shows course in `purchasedCourses` array
   - ✅ Check email for receipt

### Phase 6: Monitor & Update (Ongoing)

1. **Check logs regularly:**
   ```bash
   firebase functions:log --tail
   ```

2. **Monitor transactions:**
   - Firebase Console → Firestore → Collections → `transactions`

3. **When ready for live:**
   - Update Monnify credentials to live credentials (not test)
   - Redeploy: `firebase deploy --only functions`
   - Update webhook URL if needed

---

## 📋 Verification Checklist

After deployment, verify these work:

- [ ] Cloud Functions list shows 3 functions deployed
- [ ] Firebase config has all Monnify variables set
- [ ] App starts without errors: `npm run dev`
- [ ] Click "PAY VIA MONNIFY" opens Monnify checkout
- [ ] Webhook URL in Monnify Dashboard is correct
- [ ] Test payment completes successfully
- [ ] Course is unlocked after payment
- [ ] Transaction appears in Firestore within 30 seconds
- [ ] User document shows course as purchased
- [ ] Email receipt arrives

---

## 🔒 Security Features Enabled

| Feature | Status |
|---------|--------|
| Secret key server-side | ✅ Implemented |
| HTTPS only | ✅ Callable functions enforce |
| Webhook signature verification | ✅ HMAC-SHA512 |
| User authentication | ✅ Firebase Auth required |
| User ID validation | ✅ Must match auth user |
| Amount verification | ✅ Minimum ₦300 |
| Duplicate prevention | ✅ Idempotency check |
| Transaction audit trail | ✅ Firestore records |
| Email receipts | ✅ Automated |

---

## 📚 Documentation Files

- **`SECURE_PAYMENT_FLOW.md`** - Read this first! Explains the complete flow
- **`CLOUD_FUNCTIONS_DEPLOYMENT.md`** - Detailed deployment steps
- **`PAYMENT_TROUBLESHOOTING.md`** - Common issues and fixes
- **`PAYMENT_INTEGRATION.md`** - Original integration guide

---

## 🆘 Quick Troubleshooting

### "initializeMonnifyPayment is not a function"
→ Cloud functions not deployed. Run: `firebase deploy --only functions`

### "Failed to authenticate with Monnify" (401)
→ Credentials incorrect. Run: `firebase functions:config:get monnify`

### Course not unlocked after payment
→ Check Firestore `transactions` collection. If empty, webhook not triggered.

### Webhook not being called
→ Verify webhook URL in Monnify Dashboard → Settings → Webhooks

See `PAYMENT_TROUBLESHOOTING.md` for detailed fixes.

---

## 📞 Support Resources

- **Monnify Docs:** https://docs.monnify.com
- **Firebase Docs:** https://firebase.google.com/docs

---

## 🎯 Success Metrics

You'll know it's working when:

1. ✅ Payment initializes without errors
2. ✅ User redirected to Monnify checkout
3. ✅ After payment, redirected back to app
4. ✅ Course automatically unlocked
5. ✅ Transaction recorded in database
6. ✅ Email receipt sent
7. ✅ User can access course content

---

## 📅 Timeline

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Setup functions dir | 15 min | ⏳ TODO |
| 2 | Configure Firebase | 5 min | ⏳ TODO |
| 3 | Deploy functions | 5 min | ⏳ TODO |
| 4 | Setup Monnify webhook | 5 min | ⏳ TODO |
| 5 | Test payment flow | 10 min | ⏳ TODO |
| 6 | Go live (optional) | 5 min | ⏳ TODO |

**Total Time: ~45 minutes**

---

## Next Action

👉 **Start with Phase 1:** Create the `functions` directory and `package.json`

Then follow `CLOUD_FUNCTIONS_DEPLOYMENT.md` for detailed step-by-step instructions.

Good luck! 🚀
