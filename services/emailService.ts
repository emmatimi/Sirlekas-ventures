
import emailjs from '@emailjs/browser';

/**
 * EmailJS Service for Sirlekas Ventures
 * Handles transaction receipts and system notifications.
 */

const EMAILJS_SERVICE_ID = process.env.VITE_EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || "service_sirlekas";
const EMAILJS_RECEIPT_TEMPLATE_ID = process.env.VITE_EMAILJS_TEMPLATE_ID || process.env.EMAILJS_RECEIPT_TEMPLATE_ID || "template_receipt";
const EMAILJS_RESET_TEMPLATE_ID = process.env.VITE_EMAILJS_RESET_TEMPLATE_ID || process.env.EMAILJS_RESET_TEMPLATE_ID || "template_reset_password";
const EMAILJS_PUBLIC_KEY = process.env.VITE_EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || "user_placeholder_key";

export const emailService = {
  /**
   * Sends a professional transaction receipt to the user.
   */
  sendPaymentReceipt: async (params: {
    to_name: string;
    to_email: string;
    transaction_type: 'WALLET_FUND' | 'COURSE_UNLOCK';
    amount: number;
    reference: string;
    item_name?: string;
  }) => {
    try {
      if (EMAILJS_PUBLIC_KEY === "user_placeholder_key") return;

      const templateParams = {
        to_name: params.to_name,
        to_email: params.to_email,
        transaction_type: params.transaction_type === 'WALLET_FUND' ? 'Wallet Funding' : 'Course Unlock',
        amount: `₦${params.amount.toLocaleString()}`,
        reference: params.reference,
        item_name: params.item_name || 'Sirlekas Digital Credit',
        date: new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }),
        business_name: "Sirlekas Ventures Hub",
        support_contact: "support@sirlekasventures.com"
      };

      return await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_RECEIPT_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );
    } catch (error) {
      console.error('EmailJS Receipt Error:', error);
    }
  },

  /**
   * Sends a password reset email via EmailJS.
   * Note: In a production Firebase environment, use sendPasswordResetEmail(auth, email),
   * but this method allows for custom EmailJS styling.
   */
  sendPasswordReset: async (params: {
    user_name: string;
    to_email: string;
    reset_link: string;
  }) => {
    try {
      if (EMAILJS_PUBLIC_KEY === "user_placeholder_key") return;

      const templateParams = {
        user_name: params.user_name,
        to_email: params.to_email,
        reset_link: params.reset_link,
        business_name: "Sirlekas Ventures Hub"
      };

      return await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_RESET_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );
    } catch (error) {
      console.error('EmailJS Reset Error:', error);
    }
  }
};
