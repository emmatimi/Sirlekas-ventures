import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { User, ExamResult, Question } from "../types";
import { dbService } from "../services/dbService";
import { paymentService } from "../services/paymentService";
import { emailService } from "../services/emailService";

const DASHBOARD_EXAM_KEY = "student_dashboard_selected_exam";

type PendingTxType = "WALLET_FUND" | "COURSE_UNLOCK";

interface PendingTransaction {
  reference: string; // paymentReference (SIRL-...)
  amount: number;
  type: PendingTxType;
  examType?: string;
  subject?: string;
  timestamp?: number;
}

interface StudentDashboardProps {
  user: User;
}

const priceKey = (examType: string, subject: string) => `${examType}__${subject}`;

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user: initialUser }) => {
  const uid = initialUser.uid; // stable identity for effects

  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.toString();

  const [user, setUser] = useState<User>(initialUser);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  // Pricing
  const [coursePrices, setCoursePrices] = useState<Record<string, number>>({});
  const [defaultCoursePrice, setDefaultCoursePrice] = useState<number>(300);
  const [unlockPrice, setUnlockPrice] = useState<number>(300);

  const [selectedExamType, setSelectedExamType] = useState<string | null>(() => {
    return localStorage.getItem(DASHBOARD_EXAM_KEY);
  });

  // Wallet and Unlock States
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState(300);
  const [courseToUnlock, setCourseToUnlock] = useState<{ examType: string; subject: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Prevent Monnify redirect handler re-running forever
  const handledPaymentRef = useRef<string | null>(null);

  // If parent updates initialUser, sync local state
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const safeName = useMemo(() => {
    const n = (user as any)?.name;
    if (typeof n === "string" && n.trim()) return n.trim();
    const email = (user as any)?.email;
    if (typeof email === "string" && email.includes("@")) return email.split("@")[0];
    return "Student";
  }, [user]);

  const safeEmail = useMemo(() => {
    const e = (user as any)?.email;
    return typeof e === "string" ? e : "";
  }, [user]);

  const getLocalPrice = useCallback(
    (examType: string, subject: string) => {
      const key = priceKey(examType, subject);
      const p = Number(coursePrices[key]);
      if (Number.isFinite(p) && p > 0) return p;
      return defaultCoursePrice;
    },
    [coursePrices, defaultCoursePrice]
  );

  const refreshUser = useCallback(async () => {
    const refreshed = await dbService.getUser(uid);
    if (!refreshed) return;

    // Avoid noisy re-renders if wallet/purchases didn't change
    setUser((prev) => {
      const prevSig = JSON.stringify({
        uid: prev.uid,
        walletBalance: prev.walletBalance,
        purchasedCourses: prev.purchasedCourses,
        role: (prev as any)?.role,
      });
      const nextSig = JSON.stringify({
        uid: refreshed.uid,
        walletBalance: refreshed.walletBalance,
        purchasedCourses: refreshed.purchasedCourses,
        role: (refreshed as any)?.role,
      });
      return prevSig === nextSig ? prev : refreshed;
    });
  }, [uid]);

  // Load dashboard data + pricing
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [userResults, allQuestions, prices] = await Promise.all([
          dbService.getResults(uid),
          dbService.getQuestions(),
          dbService.getCoursePrices?.() ?? Promise.resolve({}),
        ]);

        if (cancelled) return;

        setResults(Array.isArray(userResults) ? userResults : []);
        setQuestions(Array.isArray(allQuestions) ? allQuestions : []);
        setCoursePrices(prices || {});

        // If you later add defaultPrice to dbService.getCoursePrices, set it here.
        setDefaultCoursePrice(300);

        await refreshUser();
      } catch (err) {
        if (!cancelled) console.error("StudentDashboard: initial fetch failed", err);
      }
    };

    void fetchData();

    const interval = setInterval(() => void refreshUser(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [uid, refreshUser]);

  // Persist selected exam type
  useEffect(() => {
    if (selectedExamType) localStorage.setItem(DASHBOARD_EXAM_KEY, selectedExamType);
    else localStorage.removeItem(DASHBOARD_EXAM_KEY);
  }, [selectedExamType]);

  // When user selects a course to unlock, fetch authoritative price for that course
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!courseToUnlock) {
        setUnlockPrice(defaultCoursePrice);
        return;
      }

      const { examType, subject } = courseToUnlock;

      try {
        const p = await dbService.getCoursePrice(examType, subject);
        if (cancelled) return;

        const n = Number(p);
        setUnlockPrice(Number.isFinite(n) && n > 0 ? n : getLocalPrice(examType, subject));
      } catch {
        if (!cancelled) setUnlockPrice(getLocalPrice(examType, subject));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [courseToUnlock, defaultCoursePrice, getLocalPrice]);

  // ✅ Handle Monnify redirect callback (idempotent + replace)
  useEffect(() => {
    const sp = new URLSearchParams(searchString);
    const payment = sp.get("payment");
    const ref = sp.get("ref") || sp.get("paymentReference") || "";

    if (payment !== "success" || !ref) return;

    // prevent re-running
    if (handledPaymentRef.current === ref) return;
    handledPaymentRef.current = ref;

    let cancelled = false;

    const handlePaymentRedirect = async () => {
      try {
        setIsProcessing(true);
        setError("");
        setSuccessMessage("");

        // 1) Verify payment with backend
        const verify = await paymentService.verifyPayment(ref);

        if (!verify?.verified) {
          throw new Error(`Payment not verified. Status: ${verify?.status || "UNKNOWN"}`);
        }

        // 2) Fetch latest user from Firestore to read pendingTransaction
        const refreshed = await dbService.getUser(uid);
        const pending: PendingTransaction | undefined = (refreshed as any)?.pendingTransaction;

        if (!pending) {
          throw new Error("No pending transaction found. Please contact support with your payment reference.");
        }

        // Safety check: ensure reference matches
        if (pending.reference && pending.reference !== ref) {
          throw new Error("Payment reference mismatch. Please contact support.");
        }

        // 3) Apply based on pending.type
        if (pending.type === "WALLET_FUND") {
          await dbService.addToWallet(uid, pending.amount);

          await emailService.sendPaymentReceipt({
            to_name: safeName,
            to_email: safeEmail,
            transaction_type: "WALLET_FUND",
            amount: pending.amount,
            reference: ref,
          });

          if (!cancelled) {
            setSuccessMessage(`Wallet credited with ₦${pending.amount.toLocaleString()}! Receipt sent to email.`);
          }
        } else {
          const examType = pending.examType || "";
          const subject = pending.subject || "";

          if (!examType || !subject) {
            throw new Error("Pending transaction missing examType/subject.");
          }

          // cost = 0 because they already paid via Monnify
          await dbService.purchaseCourse(uid, examType, subject, 0);

          await emailService.sendPaymentReceipt({
            to_name: safeName,
            to_email: safeEmail,
            transaction_type: "COURSE_UNLOCK",
            amount: pending.amount,
            reference: ref,
            item_name: `${subject} (${examType})`,
          });

          if (!cancelled) {
            setSuccessMessage(`${subject} unlocked successfully! Receipt sent to email.`);
          }
        }

        // 4) Clear pendingTransaction so it doesn't re-run
        await dbService.clearPendingTransaction?.(uid);

        // Refresh UI + clean query params (replace avoids router push loops)
        await refreshUser();
        if (!cancelled) {
          setSearchParams({}, { replace: true });
          setTimeout(() => setSuccessMessage(""), 8000);
        }
      } catch (err: any) {
        console.error("Payment confirmation failed:", err);
        if (!cancelled) setError(err?.message || "Payment confirmation failed. Please contact support with your reference.");
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    };

    void handlePaymentRedirect();
    return () => {
      cancelled = true;
    };
  }, [searchString, refreshUser, safeEmail, safeName, setSearchParams, uid]);

  const uniqueExamTypes: string[] = useMemo(() => Array.from(new Set(questions.map((q) => q.examType))), [questions]);

  const subjectsForSelectedExam: string[] = useMemo(() => {
    if (!selectedExamType) return [];
    return Array.from(new Set(questions.filter((q) => q.examType === selectedExamType).map((q) => q.subject)));
  }, [questions, selectedExamType]);

  const avgScore = useMemo(() => {
    if (!results.length) return 0;
    return Math.round((results.reduce((acc, r) => acc + r.score / r.total, 0) / results.length) * 100);
  }, [results]);

  const handleFundWallet = useCallback(async () => {
    // Use a sane minimum: defaultCoursePrice (or 1 if you prefer)
    const min = Math.max(defaultCoursePrice, 1);
    if (fundAmount < min) {
      setError(`Minimum funding amount is ₦${min}.`);
      return;
    }

    setIsProcessing(true);
    setError("");
    try {
      await paymentService.fundWallet(uid, fundAmount, safeEmail);
    } catch (err) {
      console.error("Fund wallet init failed:", err);
      setError("Monnify gateway unavailable. Check your internet connection.");
      setIsProcessing(false);
    }
  }, [defaultCoursePrice, fundAmount, safeEmail, uid]);

  const handleUnlockCourse = useCallback(async () => {
    if (!courseToUnlock) return;

    const { examType, subject } = courseToUnlock;
    const price = unlockPrice;

    // Wallet purchase uses course price
    if ((user.walletBalance || 0) >= price) {
      setIsProcessing(true);
      try {
        const ref = `WAL-${Date.now()}`;
        await dbService.purchaseCourse(uid, examType, subject, price);

        await emailService.sendPaymentReceipt({
          to_name: safeName,
          to_email: safeEmail,
          transaction_type: "COURSE_UNLOCK",
          amount: price,
          reference: ref,
          item_name: `${subject} (${examType})`,
        });

        await refreshUser();
        setSuccessMessage(`${subject} unlocked using wallet! Receipt sent.`);
        setCourseToUnlock(null);
      } catch (err) {
        console.error("Wallet unlock failed:", err);
        setError("Unlock failed. Try again.");
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Direct payment amount uses course price
      setIsProcessing(true);
      try {
        await paymentService.directCoursePurchase(uid, safeEmail, examType, subject, price);
      } catch (err) {
        console.error("Direct purchase init failed:", err);
        setError("Payment initialization failed.");
        setIsProcessing(false);
      }
    }
  }, [courseToUnlock, refreshUser, safeEmail, safeName, uid, unlockPrice, user.walletBalance]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-12 py-16 animate-in fade-in duration-500">
      {/* Messages */}
      {successMessage && (
        <div className="mb-8 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
            <i className="fas fa-check"></i>
          </div>
          <p className="font-bold text-emerald-900">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top duration-300">
          <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <p className="font-bold text-red-900">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-300 hover:text-red-500">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* Fund Wallet Modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-8">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Fund Your Wallet</h3>
              <button
                onClick={() => {
                  setShowFundModal(false);
                  setError("");
                }}
                className="text-slate-300 hover:text-slate-500"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Select Amount</p>
                <div className="grid grid-cols-3 gap-3">
                  {[defaultCoursePrice, defaultCoursePrice * 2, defaultCoursePrice * 5].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setFundAmount(amt)}
                      className={`py-3 rounded-xl font-black text-sm transition-all ${
                        fundAmount === amt ? "bg-blue-600 text-white shadow-lg" : "bg-white text-blue-600"
                      }`}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Or Enter Custom Amount
                </label>
                <input
                  type="number"
                  min={defaultCoursePrice}
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
                {isProcessing ? (
                  <div className="w-6 h-6 border-4 border-white/30 border-t-white animate-spin rounded-full"></div>
                ) : (
                  <span>CONTINUE TO PAYMENT</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Confirmation Modal */}
      {courseToUnlock && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-300">
            <div
              className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-6 ${
                (user.walletBalance || 0) >= unlockPrice ? "bg-emerald-50 text-emerald-500" : "bg-blue-50 text-blue-500"
              }`}
            >
              <i className={`fas ${(user.walletBalance || 0) >= unlockPrice ? "fa-wallet" : "fa-credit-card"}`}></i>
            </div>

            <h3 className="text-2xl font-black text-slate-900 mb-2">Unlock Course</h3>

            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Full access for <strong>{courseToUnlock.subject}</strong>.
              <br />
              {(user.walletBalance || 0) >= unlockPrice ? (
                <span className="text-emerald-600 font-bold">₦{unlockPrice.toLocaleString()} will be deducted from wallet.</span>
              ) : (
                <span className="text-indigo-600 font-bold">₦{unlockPrice.toLocaleString()} via Secure Monnify Gateway.</span>
              )}
            </p>

            <div className="flex flex-col gap-3">
              <button
                disabled={isProcessing}
                onClick={handleUnlockCourse}
                className={`w-full py-4 rounded-xl font-black text-sm transition shadow-lg ${
                  (user.walletBalance || 0) >= unlockPrice
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-50"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-50"
                }`}
              >
                {isProcessing ? "Processing..." : (user.walletBalance || 0) >= unlockPrice ? "PAY WITH WALLET" : "PAY VIA MONNIFY"}
              </button>

              <button onClick={() => setCourseToUnlock(null)} className="w-full bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-sm">
                CANCEL
              </button>
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

          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Welcome, {safeName}</h1>

          <p className="text-slate-500 mt-2 text-lg">Achieve excellence with focused mock practice.</p>
        </div>

        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-blue-900/10 min-w-[200px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/20 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700"></div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 relative z-10">Real Wallet Balance</p>
            <div className="flex items-center justify-between relative z-10">
              <div className="text-3xl font-black tracking-tight">₦{(user.walletBalance || 0).toLocaleString()}</div>
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
                <span>
                  {selectedExamType} <span className="text-slate-300 font-light mx-2">/</span> Subjects
                </span>
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
              uniqueExamTypes.map((examType) => (
                <button
                  key={examType}
                  onClick={() => setSelectedExamType(examType)}
                  className="group bg-white p-10 rounded-[3rem] border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-500 soft-shadow text-left flex flex-col items-start relative overflow-hidden"
                >
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-8 group-hover:rotate-12 transition-transform shadow-lg shadow-indigo-100">
                    <i className={`fas ${examType === "JAMB" ? "fa-university" : "fa-book-reader"} text-2xl`}></i>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 mb-2">{examType}</h3>
                  <p className="text-slate-500 text-sm mb-8">Professional mock repository.</p>
                  <div className="mt-auto flex items-center text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    Open Repository <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform"></i>
                  </div>
                </button>
              ))
            ) : (
              subjectsForSelectedExam.map((subject) => {
                const isPurchased = dbService.isCoursePurchased(user, selectedExamType, subject);
                const priceForThisCourse = getLocalPrice(selectedExamType, subject);

                return (
                  <div
                    key={`${selectedExamType}-${subject}`}
                    className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 hover:border-indigo-100 hover:bg-slate-50 transition-all duration-300 soft-shadow flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-8">
                      <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-lg">
                        {selectedExamType}
                      </span>
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                          isPurchased ? "bg-emerald-50 text-emerald-500" : "bg-amber-50 text-amber-500"
                        }`}
                      >
                        <i className={`fas ${isPurchased ? "fa-check-circle" : "fa-lock"}`}></i>
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-slate-900 mb-2">{subject}</h3>

                    <p className="text-slate-500 text-sm mb-10 leading-relaxed">
                      {isPurchased
                        ? "Full unlimited course content unlocked."
                        : `Access restricted. Unlock full bank for a one-time fee of ₦${priceForThisCourse.toLocaleString()}.`}
                    </p>

                    <div className="flex flex-col gap-3 mt-auto">
                      <Link
                        to={`/test/${selectedExamType}/${subject}`}
                        className="flex items-center justify-center w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-blue-600 transition-all soft-shadow"
                      >
                        {isPurchased ? "Full Practice session" : "Free Demo session"}
                      </Link>

                      {!isPurchased && (
                        <button
                          onClick={() => setCourseToUnlock({ examType: selectedExamType, subject })}
                          className="w-full bg-blue-50 text-blue-600 py-4 rounded-2xl font-black text-xs hover:bg-blue-100 transition-all border border-blue-100 uppercase tracking-widest"
                        >
                          Unlock Full Access ₦{priceForThisCourse.toLocaleString()}
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
                {results
                  .slice()
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 5)
                  .map((res) => (
                    <div key={res.id} className="flex justify-between items-center group">
                      <div>
                        <p className="text-sm font-black text-slate-900">{res.subject}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {new Date(res.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-indigo-600">{Math.round((res.score / res.total) * 100)}%</div>
                        <div className="text-[9px] font-bold text-slate-300">
                          {res.score}/{res.total}
                        </div>
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
              Each course unlock is valid for life. Pay ₦{defaultCoursePrice.toLocaleString()} once and practice forever. Payments are secured by Monnify.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
