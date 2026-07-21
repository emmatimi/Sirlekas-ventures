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
import { User, Question, ExamResult, InspirationalQuote, Transaction, BlogPost, CGPARecord } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

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

const FALLBACK_BLOG_POSTS: BlogPost[] = [
  {
    id: 'exam-readiness-guide',
    title: 'How to Build a Strong CBT Practice Routine',
    slug: 'exam-readiness-guide',
    excerpt: 'A practical guide for students preparing for JAMB, GST, and school-based CBT assessments.',
    content: 'Consistency matters more than long panic sessions. Start with a focused daily block, review missed questions immediately, and track the subjects where your confidence is weakest.\n\nUse timed practice at least twice weekly so your speed improves with accuracy. After each session, write down the topics you missed and revisit them before attempting another full mock.\n\nA strong routine should include revision, practice, correction, and rest. When those four parts are balanced, exam day becomes less frightening and more familiar.',
    category: 'Study Guide',
    tags: ['CBT', 'Study Tips', 'JAMB'],
    faqs: [
      {
        question: 'How often should I practice CBT questions?',
        answer: 'A focused daily practice block is better than waiting for long weekend sessions. Review mistakes immediately after each attempt.',
      },
    ],
    coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
    author: 'Sirlekas Ventures',
    status: 'published',
    featured: true,
    trending: true,
    readTime: 3,
    viewCount: 108,
    createdAt: Date.now() - 86400000,
    publishedAt: Date.now() - 86400000,
  },
  {
    id: 'cgpa-planning',
    title: 'Using Semester GPA to Protect Your Final CGPA',
    slug: 'cgpa-planning',
    excerpt: 'Learn how credit units and grades combine so you can plan each semester with clearer targets.',
    content: 'Your CGPA is affected most by courses with higher credit units. That means a three-unit course has more weight than a one-unit course, even when the letter grade looks the same.\n\nBefore exams, list your courses by credit unit and prioritize the ones that can move your GPA the most. After results are released, save each semester record so you can see the direction of your academic standing early.\n\nThe earlier you track your results, the easier it is to correct a weak semester before it becomes a final-year problem.',
    category: 'Academics',
    tags: ['CGPA', 'Academic Planning', 'Students'],
    faqs: [
      {
        question: 'Why should I save semester GPA records?',
        answer: 'Saved semester records make it easier to track your cumulative CGPA early and plan what grades you need next.',
      },
    ],
    coverImage: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80',
    author: 'Sirlekas Ventures',
    status: 'published',
    featured: false,
    trending: true,
    readTime: 3,
    viewCount: 74,
    createdAt: Date.now() - 172800000,
    publishedAt: Date.now() - 172800000,
  },
];

const makeCourseKey = (examType: string, subject: string) => `${examType}_${subject}`;

const isFirebaseReady = () => !!db && !!import.meta.env.VITE_FIREBASE_API_KEY;

const toMillis = (value: any): number => {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || Math.random().toString(36).slice(2, 10);

const cgpaStorageKey = (userId: string) => `sirlekas_cgpa_records_${userId}`;

const estimateReadTime = (content: string) => {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
};

const normalizeBlogPost = (id: string, data: any): BlogPost => ({
  id,
  ...data,
  slug: data.slug || slugify(data.title || id),
  category: data.category || 'News',
  tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
  faqs: Array.isArray(data.faqs)
    ? data.faqs.filter((faq: any) => faq?.question && faq?.answer)
    : [],
  author: data.author || 'Sirlekas Ventures',
  status: data.status || 'draft',
  featured: Boolean(data.featured),
  trending: Boolean(data.trending),
  readTime: Number(data.readTime || estimateReadTime(data.content || '')),
  viewCount: Number(data.viewCount || 0),
  createdAt: toMillis(data.createdAt),
  updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
  publishedAt: data.publishedAt ? toMillis(data.publishedAt) : undefined,
});
 
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
      const [users, txSnap] = await Promise.all([
        dbService.getUsers(),
        getDocs(collection(db, 'transactions')).catch(() => null),
      ]);

      const userById = new Map(users.map((user) => [user.uid, user]));
      const byReference = new Map<string, Transaction>();

      const addTx = (tx: any, fallbackUser?: User) => {
        const reference = tx.reference || tx.id;
        if (!reference) return;
        const user = userById.get(tx.userId) || fallbackUser;
        const normalized: Transaction = {
          ...tx,
          id: tx.id || `TX-${reference}`,
          reference,
          userId: tx.userId || fallbackUser?.uid || '',
          userName: tx.userName || user?.name || '',
          userEmail: tx.userEmail || tx.email || user?.email || '',
          amount: Number(tx.amount || 0),
          status: tx.status || 'PENDING',
          timestamp: toMillis(tx.timestamp),
          completedAt: tx.completedAt ? toMillis(tx.completedAt) : undefined,
        };

        const existing = byReference.get(reference);
        if (!existing || existing.status !== 'SUCCESS') {
          byReference.set(reference, normalized);
        }
      };

      txSnap?.docs.forEach((docSnap) => addTx({ id: docSnap.id, ...docSnap.data() }));

      users.forEach((user) =>
        (Array.isArray(user.transactions) ? user.transactions : []).forEach((tx) => addTx(tx, user))
      );

      return Array.from(byReference.values()).sort(
        (a, b) => (b.completedAt || b.timestamp || 0) - (a.completedAt || a.timestamp || 0)
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

  getBlogPosts: async (includeDrafts = false): Promise<BlogPost[]> => {
    if (!isFirebaseReady()) {
      const stored = JSON.parse(localStorage.getItem('sirlekas_blog_posts') || '[]') as BlogPost[];
      const posts = (stored.length > 0 ? stored : FALLBACK_BLOG_POSTS).map((post) => normalizeBlogPost(post.id, post));
      return posts
        .filter((post) => includeDrafts || post.status === 'published')
        .sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0));
    }

    try {
      const source = includeDrafts
        ? collection(db, 'blogPosts')
        : query(collection(db, 'blogPosts'), where('status', '==', 'published'));
      const snap = await getDocs(source);
      const posts = snap.docs.map((d) => normalizeBlogPost(d.id, d.data()));

      const visible = includeDrafts ? posts : posts.filter((post) => post.status === 'published');
      return visible.sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0));
    } catch (err) {
      console.warn('getBlogPosts failed; showing built-in articles.', err);
      return FALLBACK_BLOG_POSTS.filter((post) => includeDrafts || post.status === 'published');
    }
  },

  getBlogPost: async (idOrSlug: string): Promise<BlogPost | null> => {
    const posts = await dbService.getBlogPosts(true);
    return posts.find((post) => post.id === idOrSlug || post.slug === idOrSlug) || null;
  },

  saveBlogPost: async (post: BlogPost) => {
    const now = Date.now();
    const id = post.id || Math.random().toString(36).slice(2, 11);
    const payload: BlogPost = {
      ...post,
      id,
      slug: post.slug || slugify(post.title),
      tags: Array.isArray(post.tags) ? post.tags.map((tag) => tag.trim()).filter(Boolean) : [],
      faqs: Array.isArray(post.faqs) ? post.faqs.filter((faq) => faq.question?.trim() && faq.answer?.trim()) : [],
      author: post.author || 'Sirlekas Ventures',
      category: post.category || 'News',
      featured: Boolean(post.featured),
      trending: Boolean(post.trending),
      readTime: post.readTime || estimateReadTime(post.content || ''),
      viewCount: Number(post.viewCount || 0),
      createdAt: post.createdAt || now,
      updatedAt: now,
      publishedAt: post.status === 'published' ? (post.publishedAt || now) : post.publishedAt,
    };

    if (!isFirebaseReady()) {
      const current = JSON.parse(localStorage.getItem('sirlekas_blog_posts') || '[]') as BlogPost[];
      const next = current.filter((item) => item.id !== id).concat(payload);
      localStorage.setItem('sirlekas_blog_posts', JSON.stringify(next));
      return;
    }

    await setDoc(doc(db, 'blogPosts', id), payload);
  },

  uploadBlogImage: async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) throw new Error('Please choose a valid image file.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Images must be smaller than 8 MB.');
    if (!isFirebaseReady()) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Unable to read this image.'));
        reader.readAsDataURL(file);
      });
    }
    const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const path = `blog-images/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const snapshot = await uploadBytes(ref(storage, path), file, { contentType: file.type });
    return getDownloadURL(snapshot.ref);
  },

  incrementBlogPostView: async (id: string) => {
    if (!id) return;
    if (!isFirebaseReady()) {
      const current = JSON.parse(localStorage.getItem('sirlekas_blog_posts') || '[]') as BlogPost[];
      const source = current.length > 0 ? current : FALLBACK_BLOG_POSTS;
      const updated = source.map((post) => (
        post.id === id ? { ...post, viewCount: Number(post.viewCount || 0) + 1 } : post
      ));
      localStorage.setItem('sirlekas_blog_posts', JSON.stringify(updated));
      return;
    }

    try {
      await updateDoc(doc(db, 'blogPosts', id), { viewCount: increment(1) });
    } catch (err) {
      console.warn('incrementBlogPostView failed', err);
    }
  },

  deleteBlogPost: async (id: string) => {
    if (!isFirebaseReady()) {
      const current = JSON.parse(localStorage.getItem('sirlekas_blog_posts') || '[]') as BlogPost[];
      localStorage.setItem('sirlekas_blog_posts', JSON.stringify(current.filter((item) => item.id !== id)));
      return;
    }

    await deleteDoc(doc(db, 'blogPosts', id));
  },

  getCgpaRecords: async (userId: string): Promise<CGPARecord[]> => {
    if (!userId) return [];
    if (!isFirebaseReady()) {
      return JSON.parse(localStorage.getItem(cgpaStorageKey(userId)) || '[]');
    }

    try {
      const snap = await getDocs(collection(db, 'users', userId, 'cgpaRecords'));
      return snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            createdAt: toMillis(data.createdAt),
            updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
          } as CGPARecord;
        })
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } catch (err) {
      console.error('getCgpaRecords failed', err);
      return [];
    }
  },

  saveCgpaRecord: async (userId: string, record: CGPARecord) => {
    const now = Date.now();
    const id = record.id || Math.random().toString(36).slice(2, 11);
    const payload: CGPARecord = {
      ...record,
      id,
      userId,
      createdAt: record.createdAt || now,
      updatedAt: now,
    };

    if (!isFirebaseReady()) {
      const key = cgpaStorageKey(userId);
      const current = JSON.parse(localStorage.getItem(key) || '[]') as CGPARecord[];
      localStorage.setItem(key, JSON.stringify(current.filter((item) => item.id !== id).concat(payload)));
      return;
    }

    await setDoc(doc(db, 'users', userId, 'cgpaRecords', id), payload);
  },

  deleteCgpaRecord: async (userId: string, recordId: string) => {
    if (!userId || !recordId) return;
    if (!isFirebaseReady()) {
      const key = cgpaStorageKey(userId);
      const current = JSON.parse(localStorage.getItem(key) || '[]') as CGPARecord[];
      localStorage.setItem(key, JSON.stringify(current.filter((item) => item.id !== recordId)));
      return;
    }

    await deleteDoc(doc(db, 'users', userId, 'cgpaRecords', recordId));
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
