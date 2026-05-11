
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Question, ExamResult, InspirationalQuote, Transaction, User } from '../types';
import { dbService } from '../services/dbService';
import { auth } from '../services/firebase';

const EXAM_CATEGORIES = ['JAMB', 'General Studies (GST)'];

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'wallet' | 'questions' | 'results' | 'courses' | 'quotes'>('courses');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [quotes, setQuotes] = useState<InspirationalQuote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [walletStatsOverride, setWalletStatsOverride] = useState<{
    totalIncome: number;
    courseIncome: number;
    walletFunding: number;
    pendingValue: number;
    totalWalletBalance: number;
    successfulCount: number;
  } | null>(null);
  const [walletLoadError, setWalletLoadError] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [editingQuote, setEditingQuote] = useState<Partial<InspirationalQuote> | null>(null);
  const [questionSearch, setQuestionSearch] = useState('');
  const [coursePrices, setCoursePrices] = useState<Record<string, number>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, number>>({});
  const [priceMessage, setPriceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [priceToConfirm, setPriceToConfirm] = useState<{ examType: string; subject: string; oldPrice: number; newPrice: number } | null>(null);


  // Bulk Upload State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkExamType, setBulkExamType] = useState(EXAM_CATEGORIES[0]);
  const [bulkSubject, setBulkSubject] = useState('');
  const [pendingQuestions, setPendingQuestions] = useState<Question[]>([]);
  const [bulkError, setBulkError] = useState('');
  
  // Deletion State
  const [courseToDelete, setCourseToDelete] = useState<{ examType: string; subject: string; count: number } | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

const getPriceKey = (examType: string, subject: string) => `${examType}_${subject}`;
const getCoursePrice = (examType: string, subject: string) =>
  priceDraft[getPriceKey(examType, subject)] ?? coursePrices[getPriceKey(examType, subject)] ?? 300;
const hasCoursePriceChanged = (examType: string, subject: string) =>
  Number(getCoursePrice(examType, subject)) !== Number(coursePrices[getPriceKey(examType, subject)] ?? 300);

const refreshWalletSummary = useCallback(async () => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Admin session expired. Please sign in again.');

    const resp = await fetch('/api/admin/wallet-summary', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to load wallet summary');

    setWalletStatsOverride(data.stats || null);
    setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    setUsers(
      Array.isArray(data.topWalletUsers)
        ? data.topWalletUsers.map((user: any) => ({
            uid: user.uid,
            name: user.name || user.email || 'Student',
            email: user.email || '',
            role: 'student',
            walletBalance: Number(user.walletBalance || 0),
            purchasedCourses: [],
            createdAt: Date.now(),
          }))
        : []
    );
    setWalletLoadError('');
  } catch (err: any) {
    console.error('refreshWalletSummary failed', err);
    setWalletLoadError(err?.message || 'Failed to load wallet summary');
    setWalletStatsOverride(null);
  }
}, []);

const refreshData = useCallback(async () => {
  const [allQs, allResults, allQuotes, prices] = await Promise.all([
    dbService.getQuestions(),
    dbService.getResults(),
    dbService.getQuotes(),
    dbService.getCoursePrices(),
  ]);

  setQuestions(allQs);
  setResults(allResults);
  setQuotes(allQuotes);
  setCoursePrices(prices || {});
  setPriceDraft(prices || {});
  await refreshWalletSummary();
}, [refreshWalletSummary]);

useEffect(() => {
  void refreshData();
}, [refreshData]);



const requestCoursePriceSave = (examType: string, subject: string) => {
  const price = Number(getCoursePrice(examType, subject));
  if (!Number.isFinite(price) || price <= 0) {
    setPriceMessage({ type: 'error', text: 'Enter a valid course price greater than zero.' });
    return;
  }

  setPriceToConfirm({
    examType,
    subject,
    oldPrice: Number(coursePrices[getPriceKey(examType, subject)] ?? 300),
    newPrice: price,
  });
};

const saveCoursePrice = async () => {
  if (!priceToConfirm) return;
  const { examType, subject, newPrice } = priceToConfirm;
  try {
    await dbService.setCoursePrice(examType, subject, newPrice);
    setPriceMessage({ type: 'success', text: `${subject} price updated to ₦${newPrice.toLocaleString()}.` });
    setPriceToConfirm(null);
    await refreshData();
  } catch (err: any) {
    console.error('setCoursePrice failed', err);
    const msg = err?.message || 'Failed to save price.';
    setPriceMessage({ type: 'error', text: msg });
  } finally {
    setTimeout(() => setPriceMessage(null), 5000);
  }
};

const walletStats = useMemo(() => {
  if (walletStatsOverride) return walletStatsOverride;
  const successful = transactions.filter((tx) => tx.status === 'SUCCESS');
  const courseIncome = successful
    .filter((tx) => tx.type === 'COURSE_UNLOCK' || tx.category === 'COURSE_PURCHASE')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const walletFunding = successful
    .filter((tx) => tx.type === 'WALLET_FUND' || tx.category === 'WALLET_FUND')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const pendingValue = transactions
    .filter((tx) => tx.status === 'PENDING')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalWalletBalance = users.reduce((sum, user) => sum + Number(user.walletBalance || 0), 0);

  return {
    totalIncome: courseIncome + walletFunding,
    courseIncome,
    walletFunding,
    pendingValue,
    totalWalletBalance,
    successfulCount: successful.length,
  };
}, [transactions, users, walletStatsOverride]);

const topWalletUsers = useMemo(
  () =>
    users
      .slice()
      .sort((a, b) => Number(b.walletBalance || 0) - Number(a.walletBalance || 0))
      .slice(0, 5),
  [users]
);


  const groupedQuestions = useMemo(() => {
    const groups: Record<string, { examType: string; subject: string; questions: Question[] }> = {};
    
    const queryStr = questionSearch.toLowerCase().trim();
    const filtered = queryStr 
      ? questions.filter(q => 
          q.question.toLowerCase().includes(queryStr) || 
          q.subject.toLowerCase().includes(queryStr) ||
          q.examType.toLowerCase().includes(queryStr)
        )
      : questions;

    filtered.forEach(q => {
      const key = `${q.examType}_${q.subject}`;
      if (!groups[key]) {
        groups[key] = { examType: q.examType, subject: q.subject, questions: [] };
      }
      groups[key].questions.push(q);
    });
    
    return Object.values(groups).sort((a, b) => a.examType.localeCompare(b.examType) || a.subject.localeCompare(b.subject));
  }, [questions, questionSearch]);

  const courses = useMemo(() => {
    const courseMap: { [key: string]: { examType: string; subject: string; count: number } } = {};
    questions.forEach(q => {
      const key = `${q.examType}_${q.subject}`;
      if (!courseMap[key]) {
        courseMap[key] = { examType: q.examType, subject: q.subject, count: 0 };
      }
      courseMap[key].count++;
    });
    return Object.values(courseMap).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [questions]);

  const parseCSVLine = (line: string) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const processInput = (text: string, currentExamType: string, currentSubject: string) => {
    if (!text.trim()) {
      setPendingQuestions([]);
      return;
    }
    
    try {
      const lines = text.trim().split('\n');
      const validated: Question[] = [];

      lines.forEach((line) => {
        if (!line.trim()) return;
        const parts = parseCSVLine(line);
        if (parts.length < 6) return;

        const [question, optA, optB, optC, optD, correctIdxStr] = parts;
        const correctIdx = parseInt(correctIdxStr);

        if (!isNaN(correctIdx) && correctIdx >= 0 && correctIdx <= 3) {
          validated.push({
            id: Math.random().toString(36).substr(2, 9),
            examType: currentExamType,
            subject: currentSubject?.trim() || 'Pending Subject',
            question: question.trim(),
            options: [optA.trim(), optB.trim(), optC.trim(), optD.trim()],
            correctAnswer: correctIdx
          });
        }
      });
      setPendingQuestions(validated);
    } catch (err) {
      setBulkError("Parsing error. Check CSV structure.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBulkInput(content);
      processInput(content, bulkExamType, bulkSubject);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCommitBulk = async () => {
    if (!bulkSubject.trim()) {
      setBulkError("Please enter an Academic Subject name.");
      return;
    }
    
    const finalized = pendingQuestions.map(q => ({...q, subject: bulkSubject, examType: bulkExamType}));
    await Promise.all(finalized.map(q => dbService.saveQuestion(q)));
    
    setPendingQuestions([]);
    setBulkInput('');
    setBulkSubject('');
    setShowBulkModal(false);
    await refreshData();
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    
    const newQ: Question = {
      id: editingQuestion.id || Math.random().toString(36).substr(2, 9),
      examType: editingQuestion.examType || EXAM_CATEGORIES[0],
      subject: editingQuestion.subject || 'General',
      question: editingQuestion.question || '',
      options: editingQuestion.options || ['', '', '', ''],
      correctAnswer: editingQuestion.correctAnswer || 0
    };

    await dbService.saveQuestion(newQ);
    setEditingQuestion(null);
    await refreshData();
  };

  const handleAddNewQuestionToGroup = (examType: string, subject: string) => {
    setEditingQuestion({
      examType,
      subject,
      question: '',
      options: ['', '', '', ''],
      correctAnswer: 0
    });
  };

  const confirmDeleteCourse = async () => {
    if (!courseToDelete) return;
    await dbService.deleteQuestionsBySubject(courseToDelete.examType, courseToDelete.subject);
    setCourseToDelete(null);
    await refreshData();
  };

  const confirmDeleteQuestion = async () => {
    if (!questionToDelete) return;
    await dbService.deleteQuestion(questionToDelete.id);
    setQuestionToDelete(null);
    await refreshData();
  };

  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuote) return;
    const newQ: InspirationalQuote = {
      id: editingQuote.id || Math.random().toString(36).substr(2, 9),
      text: editingQuote.text || '',
      author: editingQuote.author || 'Anonymous'
    };
    await dbService.saveQuote(newQ);
    setEditingQuote(null);
    await refreshData();
  };

  const handleDeleteQuote = async (id: string) => {
    await dbService.deleteQuote(id);
    await refreshData();
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-12 py-16 animate-in fade-in duration-500">
      
      {/* CSV Bulk Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white max-w-4xl w-full rounded-[3.5rem] p-12 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tight">Bulk Repository CSV Upload</h3>
                <p className="text-slate-500 text-base mt-2">Configure target course and upload your .csv file or paste your data.</p>
              </div>
              <button 
                onClick={() => { setShowBulkModal(false); setPendingQuestions([]); setBulkError(''); }} 
                className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-12 overflow-hidden flex-grow relative">
              <div className="flex-1 flex flex-col space-y-8 overflow-y-auto pr-4 custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Exam Category</label>
                    <select 
                      className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none appearance-none font-bold text-sm text-slate-900 shadow-sm"
                      value={bulkExamType}
                      onChange={e => {
                          setBulkExamType(e.target.value);
                          processInput(bulkInput, e.target.value, bulkSubject);
                      }}
                    >
                      {EXAM_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Academic Subject</label>
                    <input 
                      className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-none outline-none font-bold text-sm text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
                      value={bulkSubject}
                      onChange={e => {
                        setBulkSubject(e.target.value);
                        processInput(bulkInput, bulkExamType, e.target.value);
                      }}
                      placeholder="e.g. Mathematics"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">File Selection</label>
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-4 py-10 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all group">
                    <i className="fas fa-cloud-upload-alt text-2xl"></i>
                    <span className="font-bold text-base">Browse CSV File</span>
                  </button>
                </div>

                <div className="space-y-3 flex-grow flex flex-col min-h-0">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Manual Content Input</label>
                  <textarea 
                    className="flex-grow w-full p-8 bg-slate-50 rounded-[2.5rem] border-none focus:ring-2 focus:ring-blue-500/10 outline-none transition-all font-mono text-sm resize-none shadow-sm placeholder:text-slate-300 leading-relaxed min-h-[120px]"
                    placeholder={`Question, OptA, OptB, OptC, OptD, CorrectIndex(0-3)`}
                    value={bulkInput}
                    onChange={(e) => {
                      setBulkInput(e.target.value);
                      processInput(e.target.value, bulkExamType, bulkSubject);
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Preview ({pendingQuestions.length} detected)</label>
                <div className="flex-grow bg-slate-50 rounded-[2.5rem] border border-slate-100 overflow-y-auto p-6 custom-scrollbar shadow-inner relative">
                  {pendingQuestions.length > 0 ? (
                    <div className="space-y-4">
                      {pendingQuestions.map((pq, i) => (
                        <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                          <p className="font-bold text-slate-900 mb-3"><span className="text-blue-500 font-black mr-2">#{i+1}</span> {pq.question}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-300">Awaiting Valid Input...</div>
                  )}
                </div>
                <button 
                  disabled={pendingQuestions.length === 0}
                  onClick={handleCommitBulk}
                  className={`w-full py-6 rounded-[2rem] font-black text-base transition-all mt-6 uppercase tracking-widest ${pendingQuestions.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-[#E2E8F0] text-slate-400 cursor-not-allowed'}`}
                >
                  Commit to Repository
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Course Deletion Modal */}
      {courseToDelete && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white max-md w-full rounded-[2.5rem] p-10 shadow-2xl border border-red-100 animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-black text-slate-900 text-center mb-2 tracking-tight uppercase">CRITICAL WARNING</h3>
            <p className="text-slate-500 text-center mb-8 text-sm leading-relaxed">Delete entire <strong>{courseToDelete.subject}</strong> repository? This will remove all {courseToDelete.count} questions. This action cannot be reversed.</p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDeleteCourse} className="w-full bg-red-600 text-white py-4 rounded-xl font-black text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100">YES, DELETE ENTIRE COURSE</button>
              <button onClick={() => setCourseToDelete(null)} className="w-full bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-sm hover:bg-slate-200 transition">KEEP FOR NOW</button>
            </div>
          </div>
        </div>
      )}

      {/* Question Deletion Modal */}
      {questionToDelete && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white max-md w-full rounded-[2.5rem] p-10 shadow-2xl border border-amber-100 animate-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mx-auto mb-6">
              <i className="fas fa-exclamation-triangle text-2xl"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Permanent Removal?</h3>
            <p className="text-slate-500 mb-8 text-sm leading-relaxed">
              Are you sure you want to delete this specific question? It will be permanently removed from the <span className="text-indigo-600 font-bold">{questionToDelete.subject}</span> repository.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDeleteQuestion} className="w-full bg-red-600 text-white py-4 rounded-xl font-black text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100">DELETE PERMANENTLY</button>
              <button onClick={() => setQuestionToDelete(null)} className="w-full bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-sm hover:bg-slate-200 transition">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {priceToConfirm && (
        <div className="fixed inset-0 z-[720] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] p-8 shadow-2xl border border-blue-100 animate-in zoom-in-95 duration-300">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
              <i className="fas fa-tag text-xl"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Confirm Price Update</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Update <strong>{priceToConfirm.subject}</strong> from ₦{priceToConfirm.oldPrice.toLocaleString()} to <strong>₦{priceToConfirm.newPrice.toLocaleString()}</strong>. New payments will use this price immediately.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPriceToConfirm(null)}
                className="py-4 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveCoursePrice}
                className="py-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-100"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {priceMessage && (
        <div className="fixed top-24 right-4 z-[760] w-[min(420px,calc(100vw-2rem))] animate-in slide-in-from-right duration-300">
          <div className={`rounded-[2rem] border p-5 shadow-2xl bg-white flex items-start gap-4 ${
            priceMessage.type === 'success' ? 'border-emerald-100' : 'border-red-100'
          }`}>
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              priceMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              <i className={`fas ${priceMessage.type === 'success' ? 'fa-check' : 'fa-exclamation-triangle'}`}></i>
            </div>
            <div className="flex-grow">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                {priceMessage.type === 'success' ? 'Update Successful' : 'Action Required'}
              </p>
              <p className="text-sm font-bold text-slate-900 leading-snug">{priceMessage.text}</p>
            </div>
            <button onClick={() => setPriceMessage(null)} className="text-slate-300 hover:text-slate-500">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {/* Main Admin UI Header */}
   <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-8">
        <div>
          <p className="text-blue-600 font-black uppercase tracking-widest text-[10px] mb-2">Excellence Hub Control</p>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Administrator</h1>
        </div>

        <div className="bg-slate-100 p-1.5 rounded-2xl flex flex-wrap gap-2 soft-shadow">
          {[
            { id: 'wallet', label: 'Wallet' },
            { id: 'courses', label: 'Course List' },
            { id: 'questions', label: 'Questions Hub' },
            { id: 'results', label: 'Performance' },
            { id: 'quotes', label: 'Motivational' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all text-xs ${
                activeTab === tab.id ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'wallet' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {walletLoadError && (
            <div className="bg-red-50 border border-red-100 rounded-[2rem] p-5 flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div>
                <p className="text-sm font-black text-red-900">Wallet data could not be loaded</p>
                <p className="text-xs text-red-700 mt-1">{walletLoadError}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {[
              { label: 'Total Income', value: walletStats.totalIncome, icon: 'fa-chart-line', tone: 'bg-slate-900 text-white' },
              { label: 'Course Sales', value: walletStats.courseIncome, icon: 'fa-graduation-cap', tone: 'bg-blue-600 text-white' },
              { label: 'Wallet Funding', value: walletStats.walletFunding, icon: 'fa-wallet', tone: 'bg-emerald-600 text-white' },
              { label: 'Pending Value', value: walletStats.pendingValue, icon: 'fa-clock', tone: 'bg-amber-500 text-white' },
            ].map((stat) => (
              <div key={stat.label} className={`${stat.tone} rounded-[2rem] p-7 shadow-xl relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">{stat.label}</p>
                    <p className="text-3xl font-black tracking-tight">₦{stat.value.toLocaleString()}</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                    <i className={`fas ${stat.icon}`}></i>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
            <section className="bg-white rounded-[2.5rem] border border-slate-100 soft-shadow overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">Revenue Ledger</p>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Transaction History</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
                    {walletStats.successfulCount} successful
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                    {transactions.length} total
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto custom-scrollbar">
                {transactions.length > 0 ? transactions
                  .slice()
                  .sort((a, b) => (b.completedAt || b.timestamp || 0) - (a.completedAt || a.timestamp || 0))
                  .map((tx) => {
                    const isSuccess = tx.status === 'SUCCESS';
                    const isWallet = tx.type === 'WALLET_FUND' || tx.category === 'WALLET_FUND';
                    return (
                      <div key={tx.id || tx.reference} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 hover:bg-slate-50/70 transition">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                            isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            <i className={`fas ${isWallet ? 'fa-wallet' : 'fa-lock-open'}`}></i>
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 truncate">
                              {isWallet ? 'Wallet Funding' : tx.item || 'Course Unlock'}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-1 truncate">
                              {tx.userName || tx.userEmail || 'Unknown student'}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 break-all">
                              {new Date(tx.completedAt || tx.timestamp || Date.now()).toLocaleString()} · {tx.reference}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between lg:justify-end gap-5">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {tx.status}
                          </span>
                          <p className="text-xl font-black text-slate-900 min-w-[110px] text-right">₦{Number(tx.amount || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  }) : (
                  <div className="p-16 text-center text-slate-400 font-bold">No transactions found yet.</div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 soft-shadow">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Student Wallet Liability</p>
                <p className="text-4xl font-black text-slate-900">₦{walletStats.totalWalletBalance.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-4 leading-relaxed">Total unused wallet balance currently held across student accounts.</p>
              </div>
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 soft-shadow">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Wallet Holders</p>
                    <h3 className="text-lg font-black text-slate-900">Top Balances</h3>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <i className="fas fa-users"></i>
                  </div>
                </div>

                {topWalletUsers.length > 0 ? (
                  <div className="space-y-4">
                    {topWalletUsers.map((student) => (
                      <div key={student.uid} className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 truncate">{student.name || student.email}</p>
                          <p className="text-[10px] font-bold text-slate-400 truncate">{student.email}</p>
                        </div>
                        <p className="font-black text-slate-900">₦{Number(student.walletBalance || 0).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-slate-400">No student wallet balances found.</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {courses.map((course) => {
            return (
              <div key={`${course.examType}_${course.subject}`} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 soft-shadow flex flex-col group relative">
                <div className="flex justify-between items-start mb-6">
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-lg border border-blue-100">
                    {course.examType}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="text-slate-400 text-xs font-bold">
                      <i className="fas fa-list-ol mr-2"></i>
                      {course.count} Qs
                    </div>
                    <button
                      onClick={() => setCourseToDelete(course)}
                      className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <i className="fas fa-trash-alt text-sm"></i>
                    </button>
                  </div>
                </div>

                <h3 className="text-2xl font-black text-slate-900 mb-2">{course.subject}</h3>
                <p className="text-sm text-slate-500 mb-6">Control the live one-time unlock price for this course.</p>
                <div className="mt-auto bg-slate-50 border border-slate-100 rounded-[2rem] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Course Price
                    </p>
                    <span className="px-3 py-1 rounded-full bg-white text-slate-400 border border-slate-100 text-[9px] font-black uppercase tracking-widest">
                      Live
                    </span>
                  </div>
                  <div className="flex gap-3 items-center bg-white border border-slate-200 rounded-2xl p-2 focus-within:ring-4 focus-within:ring-blue-500/10">
                    <span className="pl-3 text-slate-400 font-black">₦</span>
                    <input
                      type="number"
                      min={1}
                      value={getCoursePrice(course.examType, course.subject)}
                      onChange={(e) => {
                        const key = `${course.examType}_${course.subject}`;
                        setPriceDraft((prev) => ({ ...prev, [key]: Number(e.target.value) }));
                      }}
                      className="min-w-0 flex-grow py-3 bg-transparent outline-none font-black text-slate-900"
                    />
                    <button
                      disabled={!hasCoursePriceChanged(course.examType, course.subject)}
                      onClick={() => requestCoursePriceSave(course.examType, course.subject)}
                      className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-100 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
                    >
                      Update
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400 font-medium">Changes require confirmation before going live.</p>
                </div>

                <button
                  onClick={() => {
                    setActiveTab('questions');
                    setQuestionSearch(course.subject);
                  }}
                  className="mt-6 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 flex items-center"
                >
                  Manage Questions <i className="fas fa-chevron-right ml-2"></i>
                </button>
              </div>
            );
          })}

          <button
            onClick={() => setShowBulkModal(true)}
            className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center hover:border-blue-400 hover:bg-blue-50/30 transition-all text-slate-400 group"
          >
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <i className="fas fa-plus text-2xl"></i>
            </div>
            <span className="font-bold">Register New Course</span>
          </button>
        </div>
      )}


      {activeTab === 'questions' && (
        <div className="space-y-12">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-100 soft-shadow">
             <div className="relative w-full sm:w-96">
                <i className="fas fa-search absolute left-6 top-1/2 -translate-y-1/2 text-slate-300"></i>
                <input 
                  type="text" 
                  placeholder="Filter by question, subject or category..."
                  className="w-full bg-slate-50 border-none rounded-2xl pl-14 pr-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/5 font-medium text-sm"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                />
             </div>
             <button 
               onClick={() => setShowBulkModal(true)}
               className="w-full sm:w-auto bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-50 flex items-center justify-center gap-3"
             >
               <i className="fas fa-file-import text-xs opacity-60"></i>
               BULK DATA IMPORT
             </button>
          </div>

          {groupedQuestions.length > 0 ? (
            groupedQuestions.map((group, gIdx) => (
              <div key={gIdx} className="space-y-6">
                <div className="flex items-center gap-4 px-4">
                  <div className="h-px bg-slate-100 flex-grow"></div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[9px] font-black uppercase rounded-lg border border-blue-100">{group.examType}</span>
                      <h2 className="text-xl font-black text-slate-900 tracking-tight">{group.subject} <span className="text-slate-300 font-medium text-sm ml-2">({group.questions.length})</span></h2>
                    </div>
                    <button 
                      onClick={() => handleAddNewQuestionToGroup(group.examType, group.subject)}
                      className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                    >
                      <i className="fas fa-plus"></i> Add Question
                    </button>
                  </div>
                  <div className="h-px bg-slate-100 flex-grow"></div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {group.questions.map((q, qIdx) => (
                    <div key={q.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 soft-shadow hover:border-blue-100 transition-all flex flex-col md:flex-row gap-8 items-start group relative">
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-4">
                           <span className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 font-black text-xs flex items-center justify-center border border-slate-100">#{qIdx + 1}</span>
                           <h4 className="font-bold text-slate-900 leading-snug pr-12">{q.question}</h4>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} className={`px-4 py-3 rounded-xl text-[11px] font-bold border transition-all ${q.correctAnswer === oIdx ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                              <span className="opacity-30 mr-1.5 font-black">{String.fromCharCode(65+oIdx)}.</span> {opt}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex md:flex-col gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity absolute right-6 top-6 md:static">
                        <button onClick={() => setEditingQuestion(q)} className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center shadow-sm"><i className="fas fa-edit text-xs"></i></button>
                        <button onClick={() => setQuestionToDelete(q)} className="w-10 h-10 bg-red-50 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm hover:shadow-red-200"><i className="fas fa-trash-alt text-xs"></i></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="py-24 text-center bg-white rounded-[3rem] border border-slate-100 border-dashed">
               <i className="fas fa-search text-slate-100 text-8xl mb-6"></i>
               <p className="text-slate-400 font-bold text-lg">No questions match your current view.</p>
               <button onClick={() => setQuestionSearch('')} className="mt-4 text-blue-600 font-black uppercase text-xs tracking-widest hover:underline underline-offset-4">Clear Filters</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'results' && (
        <div className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 soft-shadow animate-in fade-in duration-500">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-10 py-6">Student Candidate</th>
                <th className="px-10 py-6">Course Path</th>
                <th className="px-10 py-6">Grade Percentage</th>
                <th className="px-10 py-6">Session Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.length > 0 ? results.slice().sort((a, b) => b.timestamp - a.timestamp).map(res => (
                <tr key={res.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-10 py-6 font-bold text-slate-900">
                    {(res.userName || 'Anonymous').split('@')[0]}
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded uppercase">{res.examType}</span>
                      <span className="text-sm font-medium text-slate-600">{res.subject}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <span className={`px-4 py-1.5 rounded-full font-black text-xs ${res.score/res.total > 0.6 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {Math.round((res.score / res.total) * 100)}% ({res.score}/{res.total})
                    </span>
                  </td>
                  <td className="px-10 py-6 text-slate-400 text-xs">
                    {res.timestamp ? new Date(res.timestamp).toLocaleDateString() : 'Pending Date...'}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-10 py-24 text-center text-slate-400">No student sessions recorded in this cycle.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'quotes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {quotes.map((quote, idx) => (
             <div key={quote.id} className="bg-white p-10 rounded-[2.5rem] border border-slate-100 soft-shadow relative group">
                <i className="fas fa-quote-left text-blue-50 text-4xl absolute top-8 right-8"></i>
                <p className="text-xl font-medium text-slate-700 leading-relaxed mb-10 italic">"{quote.text}"</p>
                <div className="flex justify-between items-end">
                   <div>
                     <p className="text-xs font-black text-blue-600 uppercase tracking-widest">— {quote.author}</p>
                   </div>
                   <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingQuote(quote)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-colors"><i className="fas fa-edit text-xs"></i></button>
                      <button onClick={() => handleDeleteQuote(quote.id)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                   </div>
                </div>
             </div>
           ))}
           <button 
             onClick={() => setEditingQuote({ text: '', author: '' })}
             className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-400 group"
           >
             <i className="fas fa-plus text-2xl mb-4 group-hover:scale-110 transition-transform"></i>
             <span className="font-bold">Add Inspiration</span>
           </button>
        </div>
      )}

      {/* Manual Entry Modals */}
      {editingQuestion && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white max-w-xl w-full rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{editingQuestion.id ? 'Refine Entry' : 'Manual Entry'}</h3>
                <p className="text-blue-500 text-[10px] font-black uppercase tracking-widest mt-2 tracking-[0.2em]">{editingQuestion.examType} Repository • {editingQuestion.subject}</p>
              </div>
              <button onClick={() => setEditingQuestion(null)} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"><i className="fas fa-times text-xl"></i></button>
            </div>
            
            <form onSubmit={handleSaveQuestion} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Question Prompt</label>
                <textarea 
                  className="w-full p-6 bg-slate-50 rounded-[2rem] border-none outline-none font-bold text-slate-900 min-h-[140px] focus:ring-4 focus:ring-blue-500/5 transition-all"
                  value={editingQuestion.question}
                  onChange={e => setEditingQuestion({...editingQuestion, question: e.target.value})}
                  placeholder="Type the question content here..."
                />
              </div>
              
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Options (Pick One Correct)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editingQuestion.options?.map((opt, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${editingQuestion.correctAnswer === i ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-50 bg-slate-50'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${editingQuestion.correctAnswer === i ? 'bg-emerald-500 text-white' : 'bg-white text-slate-300'}`}>
                        {String.fromCharCode(65 + i)}
                      </div>
                      <input 
                        type="text" 
                        className="flex-grow bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300"
                        value={opt}
                        placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                        onChange={e => {
                          const newOpts = [...(editingQuestion.options || [])];
                          newOpts[i] = e.target.value;
                          setEditingQuestion({...editingQuestion, options: newOpts});
                        }}
                      />
                      <input 
                        type="radio" 
                        name="correct" 
                        checked={editingQuestion.correctAnswer === i} 
                        onChange={() => setEditingQuestion({...editingQuestion, correctAnswer: i})}
                        className="accent-emerald-500 w-5 h-5 cursor-pointer"
                        title="Mark as correct"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-grow bg-[#0047AB] text-white py-6 rounded-3xl font-black shadow-xl shadow-blue-100 hover:bg-blue-800 transition-all transform active:scale-95 uppercase tracking-widest text-sm">
                  Commit to Knowledge Base
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingQuote && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white max-w-xl w-full rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tight">Inspiration Editor</h3>
            <form onSubmit={handleSaveQuote} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quote Text</label>
                <textarea className="w-full p-6 bg-slate-50 rounded-3xl border-none outline-none font-medium italic text-lg min-h-[140px]" placeholder="The wise words..." value={editingQuote.text} onChange={e => setEditingQuote({...editingQuote, text: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Attribution</label>
                <input className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-none font-black text-xs uppercase tracking-widest text-blue-600" placeholder="Author Name" value={editingQuote.author} onChange={e => setEditingQuote({...editingQuote, author: e.target.value})} />
              </div>
              <div className="flex gap-4 pt-6">
                <button type="submit" className="flex-grow bg-blue-600 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest">PUBLISH LIVE</button>
                <button type="button" onClick={() => setEditingQuote(null)} className="px-8 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs">DISCARD</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
