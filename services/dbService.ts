import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  increment,
  deleteField,
  runTransaction,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { User, Question, ExamResult, InspirationalQuote, Transaction } from '../types';

const FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'demo-1',
    examType: 'JAMB',
    subject: 'Use of English',
    question: 'Choose the option nearest in meaning to the underlined word: The professor\'s lecture was rather "arcane".',
    options: ['Boring', 'Esoteric', 'Loud', 'Concise'],
    correctAnswer: 1
  }
];

const FALLBACK_QUOTES: InspirationalQuote[] = [
  { id: 'q1', text: "Excellence is not a destination, it's a continuous journey.", author: "Sirlekas Ventures" }
];

const makeCourseKey = (examType: string, subject: string) => `${examType}_${subject}`;

const isFirebaseReady = () => !!db && !!import.meta.env.VITE_FIREBASE_API_KEY;
 
export const dbService = {
  syncUser: async (firebaseUser: any, role: string = 'student'): Promise<User> => {
    if (!isFirebaseReady()) {
      return {
        uid: firebaseUser.uid || 'mock-uid',
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Demo User',
        email: firebaseUser.email || 'demo@example.com',
        role: role as any,
        avatar: firebaseUser.photoURL || '',
        walletBalance: 0,
        purchasedCourses: [],
        createdAt: Date.now()
      };
    }

    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    const baseUser: User = {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      email: firebaseUser.email,
      role: role as any,
      avatar: firebaseUser.photoURL || '',
      walletBalance: 0,
      purchasedCourses: [],
      createdAt: Date.now()
    };

    if (userSnap.exists()) {
      const existing = userSnap.data() as Partial<User>;
      const existingRole = (existing as any)?.role;
      if (existingRole !== 'admin' && existingRole !== 'student') {
        await updateDoc(userRef, { role: role as any });
      }
      return {
        ...baseUser,
        ...existing,
        role: (existingRole === 'admin' || existingRole === 'student') ? (existingRole as any) : (role as any),
      } as User;
    }

    await setDoc(userRef, baseUser);
    return baseUser;
  },

  getUser: async (uid: string): Promise<User | null> => {
    if (!isFirebaseReady()) return null;
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    return snap.exists() ? (snap.data() as User) : null;
  },

  getUsers: async (): Promise<User[]> => {
    if (!isFirebaseReady()) return [];
    try {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
    } catch (err) {
      console.error('getUsers failed', err);
      return [];
    }
  },

  getAllTransactions: async (): Promise<Transaction[]> => {
    if (!isFirebaseReady()) return [];
    try {
      const users = await dbService.getUsers();
      return users.flatMap((user) =>
        (Array.isArray(user.transactions) ? user.transactions : []).map((tx) => ({
          ...tx,
          userId: tx.userId || user.uid,
        }))
      );
    } catch (err) {
      console.error('getAllTransactions failed', err);
      return [];
    }
  },

  getCurrentUser: (): User | null => {
    const fbUser = auth?.currentUser;
    if (!fbUser) return null;
    return {
      uid: fbUser.uid,
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
      email: fbUser.email || '',
      role: 'student',
      avatar: fbUser.photoURL || '',
      walletBalance: 0,
      purchasedCourses: [],
      createdAt: Date.now()
    };
  },

  logout: async () => {
    if (auth?.signOut) await auth.signOut();
  },

  isCoursePurchased: (user: User | null, examType: string, subject: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const courseKey = makeCourseKey(examType, subject);
    return user.purchasedCourses?.includes(courseKey) || false;
  },

  isSubscribed: (user: User | null, category: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.subscriptions?.includes(category) || false;
  },

  // FIX: purchaseCourse now uses a Firestore transaction to atomically check
  // walletBalance >= cost before decrementing, preventing a negative balance
  // caused by stale component state being used for the balance check in the UI.
  purchaseCourse: async (userId: string, examType: string, subject: string, cost: number = 300) => {
    if (!isFirebaseReady()) return;
    const userRef = doc(db, 'users', userId);
    const courseKey = makeCourseKey(examType, subject);

    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(userRef);
        if (!snap.exists()) throw new Error('User not found');

        const data = snap.data() as User;
        const currentBalance = typeof data.walletBalance === 'number' ? data.walletBalance : 0;

        if (currentBalance < cost) {
          throw new Error(`Insufficient wallet balance (have ₦${currentBalance}, need ₦${cost})`);
        }

        t.update(userRef, {
          walletBalance: increment(-cost),
          purchasedCourses: arrayUnion(courseKey),
          pendingTransaction: deleteField(),
        });
      });
    } catch (err) {
      console.error('purchaseCourse failed', err);
      throw err;
    }
  },

  addToWallet: async (userId: string, amount: number) => {
    if (!isFirebaseReady()) return;
    const userRef = doc(db, 'users', userId);
    try {
      await updateDoc(userRef, {
        walletBalance: increment(amount),
        pendingTransaction: deleteField(),
      });
    } catch (err) {
      console.error('addToWallet failed', err);
      throw err;
    }
  },

  getAvailableQuestions: async (user: User | null, category: string, subject: string): Promise<Question[]> => {
    const all = await dbService.getQuestions();
    const filtered = all.filter(q => q.examType === category && q.subject === subject);
    if (dbService.isCoursePurchased(user, category, subject)) return filtered;
    return filtered.slice(0, 15);
  },

  getQuestions: async (): Promise<Question[]> => {
    if (!isFirebaseReady()) return FALLBACK_QUESTIONS;
    try {
      const qRef = collection(db, 'questions');
      const snap = await getDocs(qRef);
      if (snap.empty) return FALLBACK_QUESTIONS;
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
    } catch (e) {
      return FALLBACK_QUESTIONS;
    }
  },

  saveQuestion: async (question: Question) => {
    if (!isFirebaseReady()) return;
    await setDoc(doc(db, 'questions', question.id), question);
  },

  deleteQuestion: async (id: string) => {
    if (!isFirebaseReady()) return;
    await deleteDoc(doc(db, 'questions', id));
  },

  deleteQuestionsBySubject: async (examType: string, subject: string) => {
    if (!isFirebaseReady()) return;
    const qRef = collection(db, 'questions');
    const q = query(qRef, where('examType', '==', examType), where('subject', '==', subject));
    const snap = await getDocs(q);
    const batch = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(batch);
  },

  saveResult: async (result: ExamResult) => {
    if (!isFirebaseReady()) {
      const existing = JSON.parse(localStorage.getItem('sirlekas_mock_results') || '[]');
      existing.push({ ...result, timestamp: Date.now() });
      localStorage.setItem('sirlekas_mock_results', JSON.stringify(existing));
      return;
    }
    await addDoc(collection(db, 'results'), {
      ...result,
      timestamp: serverTimestamp()
    });
  },

  getResults: async (userId?: string): Promise<ExamResult[]> => {
    if (!isFirebaseReady()) {
      const results = JSON.parse(localStorage.getItem('sirlekas_mock_results') || '[]');
      return userId ? results.filter((r: any) => r.userId === userId) : results;
    }
    try {
      const colRef = collection(db, 'results');
      const q = userId ? query(colRef, where('userId', '==', userId)) : query(colRef);
      const snap = await getDocs(q);
      return snap.docs.map(d => {
        const data = d.data();
        const ts = data.timestamp;
        const finalTimestamp = ts?.toMillis?.() || ts?.seconds * 1000 || ts || Date.now();
        return { id: d.id, ...data, timestamp: finalTimestamp } as ExamResult;
      });
    } catch {
      return [];
    }
  },

  getQuotes: async (): Promise<InspirationalQuote[]> => {
    if (!isFirebaseReady()) return FALLBACK_QUOTES;
    try {
      const qRef = collection(db, 'quotes');
      const snap = await getDocs(qRef);
      if (snap.empty) return FALLBACK_QUOTES;
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as InspirationalQuote));
    } catch {
      return FALLBACK_QUOTES;
    }
  },

  getCoursePrices: async (): Promise<Record<string, number>> => {
    if (!isFirebaseReady()) return {};
    try {
      const snap = await getDoc(doc(db, 'settings', 'coursePrices'));
      const data = snap.exists() ? (snap.data() as any) : {};
      return data?.prices || {};
    } catch (err) {
      return {};
    }
  },

  saveQuote: async (quote: InspirationalQuote) => {
    if (!isFirebaseReady()) return;
    await setDoc(doc(db, 'quotes', quote.id), quote);
  },

  deleteQuote: async (id: string) => {
    if (!isFirebaseReady()) return;
    await deleteDoc(doc(db, 'quotes', id));
  },

  getCoursePrice: async (examType: string, subject: string): Promise<number> => {
    if (!isFirebaseReady()) return 300;
    const snap = await getDoc(doc(db, 'settings', 'coursePrices'));
    const data = snap.exists() ? (snap.data() as any) : {};
    const prices = data?.prices || {};
    const key = makeCourseKey(examType, subject);
    const v = prices[key];
    if (Number.isFinite(Number(v))) return Number(v);
    const def = data?.defaultPrice;
    if (Number.isFinite(Number(def))) return Number(def);
    return 300;
  },

  setCoursePrice: async (examType: string, subject: string, price: number) => {
    if (!isFirebaseReady()) return;
    const key = makeCourseKey(examType, subject);
    await setDoc(
      doc(db, 'settings', 'coursePrices'),
      { defaultPrice: 300, prices: { [key]: price } },
      { merge: true }
    );
  },

  clearPendingTransaction: async (userId: string) => {
    if (!isFirebaseReady()) return;
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { pendingTransaction: deleteField() } as any);
  },

  async addTransaction(userId: string, tx: any) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      transactions: arrayUnion({
        ...tx,
        // Ensure id is always present — use reference if caller didn't supply one
        id: tx.id || `TX-${tx.reference || Date.now()}`,
        timestamp: tx.timestamp || Date.now(),
      }),
    });
  },

  async updateTransactionStatus(userId: string, reference: string, status: string) {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const transactions = data.transactions || [];
    const updated = transactions.map((tx: any) =>
      tx.reference === reference ? { ...tx, status } : tx
    );
    await updateDoc(userRef, { transactions: updated });
  }
};
