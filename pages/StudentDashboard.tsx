
import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { User, ExamResult, Question } from '../types';
import { dbService } from '../services/dbService';
import { paymentService } from '../services/paymentService';
import { emailService } from '../services/emailService';

const DASHBOARD_EXAM_KEY = 'student_dashboard_selected_exam';

interface StudentDashboardProps {
  user: User;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user: initialUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User>(initialUser);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [selectedExamType, setSelectedExamType] = useState<string | null>(() => {
    return localStorage.getItem(DASHBOARD_EXAM_KEY);
  });

  // Wallet and Unlock States
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState(300);
  const [courseToUnlock, setCourseToUnlock] = useState<{examType: string, subject: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Refresh user data periodically to ensure balance is real
  const refreshUser = async () => {
    const refreshed = await dbService.getUser(user.uid);
    if (refreshed) setUser(refreshed);
  };

  useEffect(() => {
    const fetchData = async () => {
      const userResults = await dbService.getResults(user.uid);
      setResults(userResults);

      const allQuestions = await dbService.getQuestions();
      setQuestions(allQuestions);

      await refreshUser();
    };

    fetchData();
    
    // Auto-refresh balance every 30 seconds
    const interval = setInterval(refreshUser, 30000);
    return () => clearInterval(interval);
  }, [user.uid]);

// Handle Monnify redirect callback (Success returns from Monnify)
useEffect(() => {
  const handlePaymentRedirect = async () => {
    const payment = searchParams.get('payment');
    const ref = searchParams.get('ref'); // SIRL-... paymentReference

    if (payment !== 'success' || !ref) return;

    try {
      setIsProcessing(true);
      setError('');
      setSuccessMessage('');

      // 1) Verify payment with backend
      const verify = await paymentService.verifyPayment(ref);

      if (!verify?.verified) {
        throw new Error(`Payment not verified. Status: ${verify?.status || 'UNKNOWN'}`);
      }

      // 2) Fetch latest user from Firestore to read pendingTransaction
      const refreshed = await dbService.getUser(user.uid);
      if (!refreshed || !refreshed.pendingTransaction) {
        throw new Error('No pending transaction found. Please contact support.');
      }

      const pending = refreshed.pendingTransaction;

      // Safety: ensure the reference matches what we stored
      if (pending.reference && pending.reference !== ref) {
        throw new Error('Payment reference mismatch. Please contact support.');
      }

      // 3) Apply based on pending.type
      if (pending.type === 'WALLET_FUND') {
        await dbService.addToWallet(user.uid, pending.amount);

        await emailService.sendPaymentReceipt({
          to_name: user.name,
          to_email: user.email,
          transaction_type: 'WALLET_FUND',
          amount: pending.amount,
          reference: ref,
        });

        setSuccessMessage(`Wallet credited with ₦${pending.amount}! Receipt sent to your email.`);
      } else {
        const examType = pending.examType || '';
        const subject = pending.subject || '';

        if (!examType || !subject) {
          throw new Error('Pending transaction missing examType/subject.');
        }

        // cost = 0 because payment already happened via Monnify
        await dbService.purchaseCourse(user.uid, examType, subject, 0);

        await emailService.sendPaymentReceipt({
          to_name: user.name,
          to_email: user.email,
          transaction_type: 'COURSE_UNLOCK',
          amount: pending.amount,
          reference: ref,
          item_name: `${subject} (${examType})`,
        });

        setSuccessMessage(`${subject} unlocked successfully! Receipt sent to email.`);
      }

      // 4) Refresh UI + clean query params
      await refreshUser();
      setSearchParams({});
      setTimeout(() => setSuccessMessage(''), 8000);

    } catch (err: any) {
      console.error('Payment confirmation failed:', err);
      setError(err?.message || 'Payment confirmation failed. Please contact support with your reference.');
    } finally {
      setIsProcessing(false);
    }
  };

  handlePaymentRedirect();
}, [searchParams, user.uid, setSearchParams]);

  useEffect(() => {
    if (selectedExamType) {
      localStorage.setItem(DASHBOARD_EXAM_KEY, selectedExamType);
    } else {
      localStorage.removeItem(DASHBOARD_EXAM_KEY);
    }
  }, [selectedExamType]);

  const uniqueExamTypes: string[] = Array.from(new Set(questions.map(q => q.examType)));
  
  const subjectsForSelectedExam: string[] = selectedExamType 
    ? Array.from(new Set(questions.filter(q => q.examType === selectedExamType).map(q => q.subject)))
    : [];

  const avgScore = results.length > 0 
    ? Math.round((results.reduce((acc, r) => acc + (r.score / r.total), 0) / results.length) * 100) 
    : 0;

  const handleFundWallet = async () => {
    if (fundAmount < 300) {
      setError("Minimum funding amount is ₦300.");
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      await paymentService.fundWallet(user.uid, fundAmount, user.email);
    } catch (err) {
      setError("Monnify gateway unavailable. Check your internet connection.");
      setIsProcessing(false);
    }
  };

  const handleUnlockCourse = async () => {
    if (!courseToUnlock) return;
    
    // Case 1: Use Wallet Balance
    if (user.walletBalance >= 300) {
      setIsProcessing(true);
      try {
        const ref = `WAL-${Date.now()}`;
        await dbService.purchaseCourse(user.uid, courseToUnlock.examType, courseToUnlock.subject, 300);
        await emailService.sendPaymentReceipt({
          to_name: user.name,
          to_email: user.email,
          transaction_type: 'COURSE_UNLOCK',
          amount: 300,
          reference: ref,
          item_name: `${courseToUnlock.subject} (${courseToUnlock.examType})`
        });
        await refreshUser();
        setSuccessMessage(`${courseToUnlock.subject} unlocked using wallet balance! Receipt sent.`);
        setCourseToUnlock(null);
      } catch (err) {
        setError("Unlock failed. Try again.");
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Case 2: Direct Payment via Gateway
      setIsProcessing(true);
      try {
        await paymentService.directCoursePurchase(user.uid, user.email, courseToUnlock.examType, courseToUnlock.subject);
      } catch (err) {
        setError("Payment initialization failed.");
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-12 py-16 animate-in fade-in duration-500">
      
      {/* Messages */}
      {successMessage && (
        <div className="mb-8 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"><i className="fas fa-check"></i></div>
          <p className="font-bold text-emerald-900">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
          <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0"><i className="fas fa-exclamation-triangle"></i></div>
          <p className="font-bold text-red-900">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-500"><i className="fas fa-times"></i></button>
        </div>
      )}
      
      {/* Fund Wallet Modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-8">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Fund Your Wallet</h3>
              <button onClick={() => { setShowFundModal(false); setError(''); }} className="text-slate-300 hover:text-slate-500"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Select Amount</p>
                <div className="grid grid-cols-3 gap-3">
                  {[300, 600, 1500].map(amt => (
                    <button 
                      key={amt} 
                      onClick={() => setFundAmount(amt)}
                      className={`py-3 rounded-xl font-black text-sm transition-all ${fundAmount === amt ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-blue-600'}`}
                    >
                      ₦{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Or Enter Custom Amount</label>
                <input 
                  type="number" 
                  min="300"
                  className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none font-black text-xl text-slate-900"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(Number(e.target.value))}
                />
              </div>

              <button 
                disabled={isProcessing}
                onClick={handleFundWallet}
                className="w-full bg-[#0047AB] text-white py-5 rounded-2xl font-black text-lg hover:bg-blue-800 transition-all shadow-xl shadow-blue-100 flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                {isProcessing ? <div className="w-6 h-6 border-4 border-white/30 border-t-white animate-spin rounded-full"></div> : <span>CONTINUE TO PAYMENT</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Confirmation Modal */}
      {courseToUnlock && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-300">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6 ${user.walletBalance >= 300 ? 'bg-emerald-50 text-emerald-500' : 'bg-blue-50 text-blue-500'}`}>
              <i className={`fas ${user.walletBalance >= 300 ? 'fa-wallet' : 'fa-credit-card'}`}></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Unlock Course</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Full access for <strong>{courseToUnlock.subject}</strong>. 
              <br/>
              {user.walletBalance >= 300 
                ? <span className="text-emerald-600 font-bold">₦300 will be deducted from wallet.</span>
                : <span className="text-indigo-600 font-bold">₦300 via Secure Monnify Gateway.</span>}
            </p>
            
            <div className="flex flex-col gap-3">
              <button 
                disabled={isProcessing}
                onClick={handleUnlockCourse}
                className={`w-full py-4 rounded-xl font-black text-sm transition shadow-lg ${user.walletBalance >= 300 ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-50' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-50'}`}
              >
                {isProcessing ? "Processing..." : (user.walletBalance >= 300 ? "PAY WITH WALLET" : "PAY VIA MONNIFY")}
              </button>
              <button onClick={() => setCourseToUnlock(null)} className="w-full bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-sm">CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-10">
        <div className="flex-grow">
          <p className="text-indigo-600 font-black uppercase tracking-widest text-[10px] mb-2 flex items-center">
            <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full mr-2"></span>
            Student Portal
          </p>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
            Welcome, {user.name}
          </h1>
          <p className="text-slate-500 mt-2 text-lg">Achieve excellence with focused mock practice.</p>
        </div>
        
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-blue-900/10 min-w-[200px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/20 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700"></div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 relative z-10">Real Wallet Balance</p>
            <div className="flex items-center justify-between relative z-10">
              <div className="text-3xl font-black tracking-tight">₦{user.walletBalance?.toLocaleString() || 0}</div>
              <button 
                onClick={() => setShowFundModal(true)}
                className="w-10 h-10 bg-white/10 hover:bg-blue-600 rounded-xl flex items-center justify-center transition-all"
                title="Fund Wallet"
              >
                <i className="fas fa-plus text-xs"></i>
              </button>
            </div>
          </div>
          
          <div className="hidden sm:flex bg-white p-6 rounded-3xl border border-slate-100 soft-shadow text-center min-w-[140px] items-center justify-center">
            <div>
              <div className="text-3xl font-black text-indigo-600">{avgScore}%</div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-1">Accuracy</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        {/* Exam Selection Area */}
        <div className="lg:col-span-2 space-y-10">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <i className="fas fa-layer-group text-indigo-200"></i>
              {selectedExamType ? (
                <span>{selectedExamType} <span className="text-slate-300 font-light mx-2">/</span> Subjects</span>
              ) : (
                "Select Exam Category"
              )}
            </h2>
            {selectedExamType && (
              <button 
                onClick={() => setSelectedExamType(null)}
                className="text-xs font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition"
              >
                <i className="fas fa-chevron-left mr-2"></i> Change Category
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {!selectedExamType ? (
              uniqueExamTypes.map(examType => (
                <button 
                  key={examType}
                  onClick={() => setSelectedExamType(examType)}
                  className="group bg-white p-10 rounded-[3rem] border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-500 soft-shadow text-left flex flex-col items-start relative overflow-hidden"
                >
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-8 group-hover:rotate-12 transition-transform shadow-lg shadow-indigo-100">
                    <i className={`fas ${examType === 'JAMB' ? 'fa-university' : 'fa-book-reader'} text-2xl`}></i>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 mb-2">{examType}</h3>
                  <p className="text-slate-500 text-sm mb-8">Professional mock repository.</p>
                  <div className="mt-auto flex items-center text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    Open Repository <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
                  </div>
                </button>
              ))
            ) : (
              subjectsForSelectedExam.map(subject => {
                const isPurchased = dbService.isCoursePurchased(user, selectedExamType, subject);
                return (
                  <div key={`${selectedExamType}-${subject}`} className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 hover:border-indigo-100 hover:bg-slate-50 transition-all duration-300 soft-shadow flex flex-col">
                    <div className="flex justify-between items-start mb-8">
                      <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-lg">
                        {selectedExamType}
                      </span>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isPurchased ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                        <i className={`fas ${isPurchased ? 'fa-check-circle' : 'fa-lock'}`}></i>
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-slate-900 mb-2">{subject}</h3>
                    <p className="text-slate-500 text-sm mb-10 leading-relaxed">
                      {isPurchased 
                        ? `Full unlimited course content unlocked.`
                        : `Access restricted. Unlock full bank for a one-time fee of ₦300.`}
                    </p>
                    
                    <div className="flex flex-col gap-3 mt-auto">
                      <Link 
                        to={`/test/${selectedExamType}/${subject}`}
                        className="flex items-center justify-center w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-blue-600 transition-all soft-shadow"
                      >
                        {isPurchased ? 'Full Practice session' : 'Free Demo session'}
                      </Link>
                      
                      {!isPurchased && (
                        <button 
                          onClick={() => setCourseToUnlock({ examType: selectedExamType, subject })}
                          className="w-full bg-blue-50 text-blue-600 py-4 rounded-2xl font-black text-xs hover:bg-blue-100 transition-all border border-blue-100 uppercase tracking-widest"
                        >
                          Unlock Full Access ₦300
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* History Sidebar */}
        <div className="space-y-10">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <i className="fas fa-history text-indigo-200"></i>
            Recent Attempts
          </h2>

          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 soft-shadow">
             {results.length > 0 ? (
               <div className="space-y-6">
                 {results.slice(0, 5).map(res => (
                   <div key={res.id} className="flex justify-between items-center group">
                      <div>
                        <p className="text-sm font-black text-slate-900">{res.subject}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(res.timestamp).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-indigo-600">{Math.round((res.score / res.total) * 100)}%</div>
                        <div className="text-[9px] font-bold text-slate-300">{res.score}/{res.total}</div>
                      </div>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="text-center py-10">
                 <p className="text-slate-300 text-sm font-bold">No exam records found.</p>
               </div>
             )}
          </div>

          <div className="bg-blue-50 p-8 rounded-[2.5rem] border border-blue-100">
             <h4 className="font-black text-blue-900 text-sm uppercase tracking-widest mb-4">Pricing Note</h4>
             <p className="text-xs text-blue-700 leading-relaxed font-medium">
               Each course unlock is valid for life. Pay ₦300 once and practice forever. Payments are secured by Monnify.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
