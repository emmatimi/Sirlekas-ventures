import { auth } from "./firebase";

const INIT_ENDPOINT = "/api/monnify/init";
const VERIFY_ENDPOINT = "/api/monnify/verify";

interface InitPaymentResponse {
  checkoutUrl: string;
  paymentReference: string;
  monnifyTransactionReference?: string;
}

export const paymentService = {
  fundWallet: async (userId: string, amount: number, email: string) => {
    const resp = await fetch(INIT_ENDPOINT, {
      method: "POST",
      headers: await paymentService.getAuthHeaders(),
      body: JSON.stringify({
        userId,
        examType: "WALLET_FUND",
        subject: "Wallet Funding",
        email,
        amount,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Payment initialization failed");
    }

    const result: InitPaymentResponse = await resp.json();
    const { checkoutUrl, paymentReference, monnifyTransactionReference } = result;

    if (!checkoutUrl || !paymentReference) {
      throw new Error("Invalid payment initialization response");
    }

    // Store references in localStorage
    localStorage.setItem("paymentReference", paymentReference);
    if (monnifyTransactionReference) {
      localStorage.setItem("monnifyTransactionReference", monnifyTransactionReference);
    }

    window.location.href = checkoutUrl;
  },

  directCoursePurchase: async (
    userId: string,
    email: string,
    examType: string,
    subject: string,
    amount: number
  ) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error("Invalid amount");
    }

    const resp = await fetch(INIT_ENDPOINT, {
      method: "POST",
      headers: await paymentService.getAuthHeaders(),
      body: JSON.stringify({
        userId,
        examType,
        subject,
        email,
        amount: numericAmount,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Payment initialization failed");
    }

    const result: InitPaymentResponse = await resp.json();
    const { checkoutUrl, paymentReference, monnifyTransactionReference } = result;

    if (!checkoutUrl || !paymentReference) {
      throw new Error("Invalid payment initialization response");
    }

    localStorage.setItem("paymentReference", paymentReference);
    if (monnifyTransactionReference) {
      localStorage.setItem("monnifyTransactionReference", monnifyTransactionReference);
    }

    window.location.href = checkoutUrl;
  },

  verifyPayment: async (userId: string) => {
    const paymentReference = localStorage.getItem("paymentReference");
    const monnifyTransactionReference = localStorage.getItem("monnifyTransactionReference");

    if (!paymentReference && !monnifyTransactionReference) {
      throw new Error("No payment reference found");
    }

    const resp = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: await paymentService.getAuthHeaders(),
      body: JSON.stringify({
        userId,
        paymentReference,
        monnifyTransactionReference,
      }),
    });

    // FIX 3: treat non-200 HTTP status from our verify endpoint as a real error,
    // not as PENDING. verify.js now returns 503 for auth/network failures so the
    // retry loop in the dashboard can distinguish retryable from fatal.
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      // Surface as a non-"failed/cancel" error so verifyWithRetry retries it
      throw new Error(errData.error || `Verify endpoint returned ${resp.status}`);
    }

    const data = await resp.json();
    console.log("VERIFY RESPONSE:", data);

    const status = data?.responseBody?.paymentStatus;

    if (status === "PAID") {
      return { verified: true };
    }

    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error("Payment failed");
    }

    // PENDING or anything else → return unverified so caller retries
    return { verified: false };
  },

  getAuthHeaders: async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("User not logged in.");

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  },
};
