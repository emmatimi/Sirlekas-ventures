
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
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { User, Question, ExamResult, InspirationalQuote } from '../types';

const FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'demo-1',
    examType: 'JAMB',
    subject: 'Use of English',
    question: 'Choose the option nearest in meaning to the underlined word: The professor’s lecture was rather "arcane".',
    options: ['Boring', 'Esoteric', 'Loud', 'Concise'],
    correctAnswer: 1
  }
];

const FALLBACK_QUOTES: InspirationalQuote[] = [
  { id: 'q1', text: "Excellence is not a destination, it's a continuous journey.", author: "Sirlekas Ventures" }
];

// Consider Firebase 'ready' when `db` exists and a Firebase API key is present.
// This avoids attempting real Firestore ops when the app was initialized in a fallback mode.
const isFirebaseReady = () => !!db && !!process.env.VITE_FIREBASE_API_KEY;

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

    if (userSnap.exists()) {
      return userSnap.data() as User;
    }

    const newUser: User = {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      email: firebaseUser.email,
      role: role as any,
      avatar: firebaseUser.photoURL || '',
      walletBalance: 0,
      purchasedCourses: [],
      createdAt: Date.now()
    };

    await setDoc(userRef, newUser);
    return newUser;
  },

  getUser: async (uid: string): Promise<User | null> => {
    if (!isFirebaseReady()) return null;
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    return snap.exists() ? (snap.data() as User) : null;
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
    const courseKey = `${examType}-${subject}`;
    return user.purchasedCourses?.includes(courseKey) || false;
  },

  // Legacy support
  isSubscribed: (user: User | null, category: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.subscriptions?.includes(category) || false;
  },

  purchaseCourse: async (userId: string, examType: string, subject: string, cost: number = 300) => {
    if (!isFirebaseReady()) return;
    const userRef = doc(db, 'users', userId);
    const courseKey = `${examType}-${subject}`;
    try {
      await updateDoc(userRef, {
        walletBalance: increment(-cost),
        purchasedCourses: arrayUnion(courseKey)
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
        walletBalance: increment(amount)
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

  // Fix for AdminDashboard.tsx - Adding missing deleteQuestionsBySubject
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
        let finalTimestamp = ts?.toMillis?.() || ts?.seconds * 1000 || ts || Date.now();
        return { id: d.id, ...data, timestamp: finalTimestamp } as ExamResult;
      });
    } catch (error) {
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
    } catch (error) {
      return FALLBACK_QUOTES;
    }
  },

  saveQuote: async (quote: InspirationalQuote) => {
    if (!isFirebaseReady()) return;
    await setDoc(doc(db, 'quotes', quote.id), quote);
  },

  // Fix for AdminDashboard.tsx - Adding missing deleteQuote
  deleteQuote: async (id: string) => {
    if (!isFirebaseReady()) return;
    await deleteDoc(doc(db, 'quotes', id));
  }
};
