
export type UserRole = 'student' | 'admin';

export interface User {
  uid: string; // Firebase Auth UID
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  subscriptions?: string[]; 
  purchasedCourses?: string[]; // format: "examType_subject"
  walletBalance: number;
  createdAt: number;
  pendingTransaction?: PendingTransaction;
  transactions?: Transaction[];
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

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags?: string[];
  faqs?: Array<{
    question: string;
    answer: string;
  }>;
  coverImage?: string;
  author: string;
  status: 'draft' | 'published';
  featured?: boolean;
  trending?: boolean;
  readTime?: number;
  viewCount?: number;
  createdAt: number;
  updatedAt?: number;
  publishedAt?: number;
}

export interface CGPACourse {
  id: string;
  name: string;
  unit: number;
  grade: string;
}

export interface CGPARecord {
  id: string;
  userId: string;
  session: string;
  semester: string;
  courses: CGPACourse[];
  totalUnits: number;
  totalPoints: number;
  gpa: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Transaction {
  id?: string;
  reference: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  category?: string; // "WALLET_FUND" or "COURSE_PURCHASE"
  type?: 'WALLET_FUND' | 'COURSE_UNLOCK';
  item?: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  timestamp: number;
  completedAt?: number;
}

export type PendingTransaction = {
  reference: string;            // SIRL-... paymentReference
  amount: number;
  type: 'WALLET_FUND' | 'COURSE_UNLOCK';
  examType?: string;
  subject?: string;
  timestamp: number;
};

export type PricingSettings = {
  coursePrice: number;
};
