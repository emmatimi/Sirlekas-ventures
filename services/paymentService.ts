
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

const INIT_ENDPOINT = '/api/monnify/init';
const VERIFY_ENDPOINT = '/api/monnify/verify';

export const paymentService = {
  /**
   * Initializes a Monnify payment (via secure Cloud Function)
   * The Cloud Function handles Monnify authentication server-side.
   */
  fundWallet: async (userId: string, amount: number, email: string) => {
    try {
      const resp = await fetch(INIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, examType: 'WALLET_FUND', subject: 'Wallet Funding', email, amount })
      });
      if (!resp.ok) throw new Error('Init failed');
      const result = await resp.json();
      const { checkoutLink } = result;

      // Store pending transaction for reference
      await updateDoc(doc(db, 'users', userId), {
        pendingTransaction: {
          reference: result.data.transactionReference,
          amount,
          type: 'WALLET_FUND',
          timestamp: Date.now()
        }
      });

      // Redirect to Monnify checkout
      if (checkoutLink) {
        window.location.href = checkoutLink;
      } else {
        throw new Error('No checkout link received');
      }
    } catch (error) {
      console.error('Payment Initialization Error:', error);
      throw error;
    }
  },

  /**
   * Initializes a direct course payment (via secure Cloud Function)
   */
  directCoursePurchase: async (userId: string, email: string, examType: string, subject: string) => {
    try {
      const amount = 300;
      const resp = await fetch(INIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, examType, subject, email, amount })
      });
      if (!resp.ok) throw new Error('Init failed');
      const result = await resp.json();
      const { checkoutLink, transactionReference } = result;

      // Store pending transaction for reference
      await updateDoc(doc(db, 'users', userId), {
        pendingTransaction: {
          reference: transactionReference,
          amount,
          examType,
          subject,
          type: 'COURSE_UNLOCK',
          timestamp: Date.now()
        }
      });

      // Redirect to Monnify checkout
      if (checkoutLink) {
        window.location.href = checkoutLink;
      } else {
        throw new Error('No checkout link received');
      }
    } catch (error) {
      console.error('Course Purchase Error:', error);
      throw error;
    }
  },

  /**
   * Verify payment status (callback after redirect)
   * Can be called from frontend after user returns from Monnify checkout
   */
  verifyPayment: async (transactionReference: string) => {
    try {
      const resp = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionReference })
      });
      if (!resp.ok) throw new Error('Verify failed');
      return await resp.json();
    } catch (error) {
      console.error('Payment Verification Error:', error);
      throw error;
    }
  }
};
