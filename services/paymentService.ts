import { db } from "./firebase";
import { doc, setDoc, getDoc, updateDoc, arrayUnion, deleteField } from "firebase/firestore";

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
      headers: { "Content-Type": "application/json" },
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

    const userRef = doc(db, "users", userId);

    // FIX 1: write pendingTransaction with updateDoc (no merge on this field) so any
    // stale reference from a previous failed payment is always overwritten, not left
    // alongside the new one. Use arrayUnion only for the transactions log.
    await updateDoc(userRef, {
      pendingTransaction: {
        reference: paymentReference,
        monnifyTransactionReference: monnifyTransactionReference ?? null,
        amount,
        type: "WALLET_FUND",
        timestamp: Date.now(),
      },
    });

    // FIX 2: add a proper id field so the dashboard's React key is never undefined
    await updateDoc(userRef, {
      transactions: arrayUnion({
        id: `TX-${paymentReference}`,
        reference: paymentReference,
        userId,
        category: "WALLET_FUND",
        type: "WALLET_FUND",
        amount,
        status: "PENDING",
        timestamp: Date.now(),
      }),
    });

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
      headers: { "Content-Type": "application/json" },
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

    const userRef = doc(db, "users", userId);

    // FIX 1 (same as fundWallet): overwrite pendingTransaction unconditionally
    await updateDoc(userRef, {
      pendingTransaction: {
        reference: paymentReference,
        monnifyTransactionReference: monnifyTransactionReference ?? null,
        amount: numericAmount,
        examType,
        subject,
        type: "COURSE_UNLOCK",
        timestamp: Date.now(),
      },
    });

    // FIX 2: include id field on the embedded transaction record
    await updateDoc(userRef, {
      transactions: arrayUnion({
        id: `TX-${paymentReference}`,
        reference: paymentReference,
        userId,
        category: "COURSE_PURCHASE",
        type: "COURSE_UNLOCK",
        item: `${subject} (${examType})`,
        amount: numericAmount,
        status: "PENDING",
        timestamp: Date.now(),
      }),
    });

    window.location.href = checkoutUrl;
  },

  verifyPayment: async (_userId: string) => {
    const paymentReference = localStorage.getItem("paymentReference");
    const monnifyTransactionReference = localStorage.getItem("monnifyTransactionReference");

    if (!paymentReference && !monnifyTransactionReference) {
      throw new Error("No payment reference found");
    }

    const resp = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
};
