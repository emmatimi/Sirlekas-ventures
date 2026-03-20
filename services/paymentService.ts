import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
const INIT_ENDPOINT = "/api/monnify/init";
const VERIFY_ENDPOINT = "/api/monnify/verify";

interface InitPaymentResponse {
  checkoutUrl: string;
  paymentReference: string; // SIRL-...
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

  const {
    checkoutUrl,
    paymentReference,
    monnifyTransactionReference,
  } = result;

  if (!checkoutUrl || !paymentReference) {
    throw new Error("Invalid payment initialization response");
  }

  // STORE LOCALLY
  localStorage.setItem("paymentReference", paymentReference);

  if (monnifyTransactionReference) {
    localStorage.setItem(
      "monnifyTransactionReference",
      monnifyTransactionReference
    );
  }

  // STORE IN FIRESTORE
  await setDoc(
    doc(db, "users", userId),
    {
      pendingTransaction: {
        reference: paymentReference,
        monnifyTransactionReference, 
        amount,
        type: "WALLET_FUND",
        timestamp: Date.now(),
      },
    },
    { merge: true }
  );

  // Redirect to Monnify
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
    const { checkoutUrl, paymentReference,monnifyTransactionReference } = result;

    if (monnifyTransactionReference) {
      localStorage.setItem(
        "monnifyTransactionReference",
        monnifyTransactionReference
      );
    }
    if (!checkoutUrl || !paymentReference) {
      throw new Error("Invalid payment initialization response");
    }
      localStorage.setItem("paymentReference", paymentReference);

    await setDoc(
      doc(db, "users", userId),
      {
      pendingTransaction: {
        reference: paymentReference,
        monnifyTransactionReference, 
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

    verifyPayment: async (userId: string) => {
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    const user = userDoc.data();

    // Case 1: webhook completed
    if (!user?.pendingTransaction) {
      return { verified: true };
    }

    //  Case 2: still pending
    const createdAt = user.pendingTransaction?.timestamp;

    // optional timeout check (avoid infinite wait)
    if (createdAt && Date.now() - createdAt > 5 * 60 * 1000) {
      throw new Error("Payment delayed, please refresh");
    }

    throw new Error("Payment still processing");
  },
};
