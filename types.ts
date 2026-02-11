
export type UserRole = 'student' | 'admin';

export interface User {
  uid: string; // Firebase Auth UID
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  subscriptions?: string[]; 
  purchasedCourses?: string[]; // format: "examType-subject"
  walletBalance: number;
  createdAt: number;
   pendingTransaction?: PendingTransaction;
}

export interface Question {
  id: string;
  examType: string;
  subject: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface ExamResult {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  examType: string;
  score: number;
  total: number;
  timestamp: number;
}

export interface InspirationalQuote {
  id: string;
  text: string;
  author: string;
}

export interface Transaction {
  reference: string;
  userId: string;
  category: string; // "WALLET_FUND" or "COURSE_PURCHASE"
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  timestamp: number;
}

export type PendingTransaction = {
  reference: string;            // SIRL-... paymentReference
  amount: number;
  type: 'WALLET_FUND' | 'COURSE_UNLOCK';
  examType?: string;
  subject?: string;
  timestamp: number;
};