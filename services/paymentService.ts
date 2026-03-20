import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";

const INIT_ENDPOINT = "/api/monnify/init";
const VERIFY_ENDPOINT = "/api/monnify/verify";

interface InitPaymentResponse {
  checkoutUrl: string;
  paymentReference: string; // SIRL-...
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
    const { checkoutUrl, paymentReference } = result;

    if (!checkoutUrl || !paymentReference) {
      throw new Error("Invalid payment initialization response");
    }

    await setDoc(
      doc(db, "users", userId),
      {
        pendingTransaction: {
          reference: paymentReference,
          amount,
          type: "WALLET_FUND",
          timestamp: Date.now(),
        },
      },
      { merge: true }
    );

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
    const { checkoutUrl, paymentReference } = result;

    if (!checkoutUrl || !paymentReference) {
      throw new Error("Invalid payment initialization response");
    }

    await setDoc(
      doc(db, "users", userId),
      {
        pendingTransaction: {
          reference: paymentReference,
          amount: numericAmount,
          examType,
          subject,
          type: "COURSE_UNLOCK",
          timestamp: Date.now(),
        },
      },
      { merge: true }
    );

    window.location.href = checkoutUrl;
  },

  verifyPayment: async (
    paymentReference: string,
    monnifyTransactionReference?: string
  ) => {
    const resp = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentReference,
        monnifyTransactionReference,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Payment verification failed");
    }

    return await resp.json();
  },
};
