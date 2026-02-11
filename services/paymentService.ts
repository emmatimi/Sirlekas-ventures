import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

const INIT_ENDPOINT = '/api/monnify/init';
const VERIFY_ENDPOINT = '/api/monnify/verify';

interface InitPaymentResponse {
  checkoutUrl: string;
  paymentReference: string; // SIRL-...
}


export const paymentService = {
  /**
   * Fund wallet via Monnify
   */
  fundWallet: async (
    userId: string,
    amount: number,
    email: string
  ) => {
    try {
      const resp = await fetch(INIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          examType: 'WALLET_FUND',
          subject: 'Wallet Funding',
          email,
          amount
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Payment initialization failed');
      }

     const result: InitPaymentResponse = await resp.json();
      const { checkoutUrl, paymentReference } = result;

      if (!checkoutUrl || !paymentReference) {
        throw new Error('Invalid payment initialization response');
      }

          await setDoc(doc(db, 'users', userId), {
        pendingTransaction: {
          reference: paymentReference,
          amount,
          type: 'WALLET_FUND',
          timestamp: Date.now()
        }
      }, { merge: true });

      window.location.href = checkoutUrl;


    } catch (error) {
      console.error('Wallet Funding Error:', error);
      throw error;
    }
  },

  /**
   * Direct course purchase via Monnify
   */
  directCoursePurchase: async (
    userId: string,
    email: string,
    examType: string,
    subject: string
  ) => {
    try {
      const amount = 300;

      const resp = await fetch(INIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          examType,
          subject,
          email,
          amount
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Payment initialization failed');
      }

      const result: InitPaymentResponse = await resp.json();
      const { checkoutUrl, paymentReference } = result;

      if (!checkoutUrl || !paymentReference) {
        throw new Error('Invalid payment initialization response');
      }

        await setDoc(
        doc(db, 'users', userId),
        {
          pendingTransaction: {
            reference: paymentReference,
            amount,
            examType,
            subject,
            type: 'COURSE_UNLOCK',
            timestamp: Date.now(),
          },
        },
        { merge: true }
      );


      window.location.href = checkoutUrl;



    } catch (error) {
      console.error('Course Purchase Error:', error);
      throw error;
    }
  },

  /**
   * Verify payment after redirect
   */
  verifyPayment: async (transactionReference: string) => {
    try {
      const resp = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionReference })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Payment verification failed');
      }

      return await resp.json();

    } catch (error) {
      console.error('Payment Verification Error:', error);
      throw error;
    }
  }
};
