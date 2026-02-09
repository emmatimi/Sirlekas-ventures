
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Question, ExamResult } from '../types';
import { dbService } from '../services/dbService';

interface CBTTestProps {
  user: User;
}

const CBTTest: React.FC<CBTTestProps> = ({ user }) => {
  const { examType, subject } = useParams<{ examType: string; subject: string }>();
  const navigate = useNavigate();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<{ [key: string]: number }>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReview, setShowReview] = useState(false);
  
  const answersRef = useRef<{ [key: string]: number }>({});
  const questionsRef = useRef<Question[]>([]);

  // Update refs to avoid closure staleness in callbacks
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!examType || !subject) return;
    
    const fetchQuestions = async () => {
      const available = await dbService.getAvailableQuestions(user, examType, subject);
      
      if (available.length === 0) {
        navigate('/dashboard');
        return;
      }
      
      setQuestions(available);
      questionsRef.current = available;
      setTimeLeft(available.length * 60);
    };
    fetchQuestions();
  }, [examType, subject, navigate, user]);

  const forceSubmit = useCallback(() => {
    const currentQuestions = questionsRef.current;
    const currentAnswers = answersRef.current;
    
    let scoreCount = 0;
    currentQuestions.forEach(q => {
      if (currentAnswers[q.id] === q.correctAnswer) {
        scoreCount++;
      }
    });

    const newResult: ExamResult = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      userName: user.name,
      subject: subject || '',
      examType: examType || '',
      score: scoreCount,
      total: currentQuestions.length,
      timestamp: Date.now()
    };

    dbService.saveResult(newResult);
    setResult(newResult);
    setIsFinished(true);
    setShowSubmitModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [user.uid, user.name, subject, examType]);

  // Handle Timer
  useEffect(() => {
    if (isFinished) return;
    
    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId);
          forceSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [isFinished, forceSubmit]);

  // Results View
  if (isFinished && result) {
    const isSubbed = dbService.isSubscribed(user, examType || '');
    
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 animate-in fade-in duration-500">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Result Summary Card */}
          <div className="bg-white p-10 md:p-16 rounded-[3.5rem] text-center shadow-2xl border border-slate-100">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 text-4xl mx-auto mb-10">
              <i className="fas fa-check-double"></i>
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Exam Complete!</h1>
            <p className="text-slate-500 mb-12 text-lg leading-relaxed">Your attempt has been successfully submitted. Review your performance below.</p>
            
            <div className="grid grid-cols-2 gap-8 mb-10">
              <div className="bg-slate-50 p-8 rounded-3xl text-center border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-2">Final Score</p>
                <p className="text-4xl font-black text-slate-900">{result.score}<span className="text-slate-300 text-xl font-medium">/{result.total}</span></p>
              </div>
              <div className="bg-slate-50 p-8 rounded-3xl text-center border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-2">Percentage</p>
                <p className="text-4xl font-black text-[#0047AB]">{Math.round((result.score / result.total) * 100)}%</p>
              </div>
            </div>

            {!isSubbed && (
              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-10 flex items-center gap-4 text-left">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shrink-0 shadow-sm"><i className="fas fa-lock"></i></div>
                <div>
                  <p className="text-xs font-bold text-blue-900 leading-snug">Limited Performance Review</p>
                  <p className="text-[10px] text-blue-600/70 font-medium">Upgrade to access full historical performance tracking and detailed question analysis.</p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => setShowReview(!showReview)}
                className={`flex-grow py-5 rounded-2xl font-black text-lg transition-all shadow-lg flex items-center justify-center gap-3 ${showReview ? 'bg-slate-100 text-slate-700' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'}`}
              >
                <i className={`fas ${showReview ? 'fa-eye-slash' : 'fa-list-check'}`}></i>
                {showReview ? 'Hide Corrections' : 'Review My Answers'}
              </button>
              <button 
                onClick={() => navigate('/dashboard')}
                className="flex-grow bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all shadow-lg"
              >
                Exit to Dashboard
              </button>
            </div>
          </div>

          {/* Detailed Question Review List */}
          {showReview && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
              <h2 className="text-2xl font-black text-slate-900 px-6 flex items-center gap-4">
                <span className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center text-sm"><i className="fas fa-search"></i></span>
                Question-by-Question Breakdown
              </h2>
              {questions.map((q, idx) => {
                const userChoice = answers[q.id];
                const isCorrect = userChoice === q.correctAnswer;

                return (
                  <div key={q.id} className={`bg-white rounded-[2.5rem] p-8 md:p-12 shadow-sm border transition-all ${isCorrect ? 'border-emerald-100 bg-emerald-50/5' : 'border-rose-100 bg-rose-50/5'}`}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-6">
                          <span className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                            {isCorrect ? <i className="fas fa-check"></i> : <i className="fas fa-times"></i>}
                          </span>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Question {idx + 1}</p>
                            <h4 className={`text-base font-bold uppercase tracking-tight ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isCorrect ? 'Correct Answer' : 'Missed Question'}
                            </h4>
                          </div>
                        </div>
                        <h3 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug">{q.question}</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {q.options.map((opt, oIdx) => {
                        const isUserChoice = userChoice === oIdx;
                        const isCorrectAnswer = q.correctAnswer === oIdx;
                        
                        let borderClass = 'border-slate-50 bg-slate-50';
                        let iconClass = 'bg-white text-slate-300';
                        let textClass = 'text-slate-500';

                        if (isCorrectAnswer) {
                          borderClass = 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm shadow-emerald-100';
                          iconClass = 'bg-emerald-500 text-white';
                          textClass = 'text-emerald-900 font-bold';
                        } else if (isUserChoice && !isCorrect) {
                          borderClass = 'border-rose-500 bg-rose-50 text-rose-900';
                          iconClass = 'bg-rose-500 text-white';
                          textClass = 'text-rose-900 font-bold';
                        }

                        return (
                          <div key={oIdx} className={`flex items-center p-6 rounded-[1.8rem] border-2 transition-all duration-300 relative ${borderClass}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black mr-5 text-xs ${iconClass}`}>
                              {String.fromCharCode(65 + oIdx)}
                            </div>
                            <span className={`text-sm md:text-base ${textClass}`}>{opt}</span>
                            {isCorrectAnswer && (
                              <div className="absolute top-2 right-4 text-[9px] font-black uppercase text-emerald-600 tracking-widest flex items-center gap-1">
                                <i className="fas fa-check-circle"></i> Correct Answer
                              </div>
                            )}
                            {isUserChoice && !isCorrect && (
                              <div className="absolute top-2 right-4 text-[9px] font-black uppercase text-rose-600 tracking-widest flex items-center gap-1">
                                <i className="fas fa-times-circle"></i> Your Selection
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="py-12 flex justify-center">
                <button 
                  onClick={() => {
                    setShowReview(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-slate-100 text-slate-500 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  <i className="fas fa-arrow-up mr-2"></i> Back to Top
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleOpenSubmitModal = () => {
    setShowSubmitModal(true);
  };

  const scrollToQuestion = (index: number) => {
    const el = document.getElementById(`question-${index}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (questions.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
    </div>
  );

  const unansweredCount = questions.length - Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Custom Modal for Confirmation */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white max-w-lg w-full rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-8 ${unansweredCount > 0 ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-600'}`}>
              <i className={`fas ${unansweredCount > 0 ? 'fa-exclamation-triangle' : 'fa-clipboard-check'}`}></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 text-center mb-4">
              {unansweredCount > 0 ? 'Wait! Incomplete Exam' : 'Confirm Submission'}
            </h3>
            <p className="text-slate-500 text-center mb-10 leading-relaxed text-sm">
              {unansweredCount > 0 
                ? `You have ${unansweredCount} questions left unanswered. Do you want to submit anyway?` 
                : "Great job! You have answered all questions. Are you ready to submit and see your score?"}
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={forceSubmit}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-100"
              >
                SUBMIT EXAM NOW
              </button>
              <button 
                onClick={() => setShowSubmitModal(false)}
                className="w-full bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-sm hover:bg-slate-200 transition"
              >
                BACK TO REVIEW
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Exam Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-5 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 text-lg shadow-sm">
            <i className="fas fa-file-alt"></i>
          </div>
          <div>
            <h3 className="text-sm md:text-lg font-black text-slate-900 uppercase tracking-tight leading-none">{subject}</h3>
            <p className="hidden md:block text-[9px] text-slate-400 font-bold tracking-widest mt-1 uppercase">
              {examType} {!dbService.isSubscribed(user, examType || '') ? '• Free Tier Session' : '• Premium Session'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 md:space-x-10">
          <div className={`text-2xl md:text-3xl font-mono font-black ${timeLeft < 60 && timeLeft > 0 ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>
            {formatTime(timeLeft)}
          </div>
          <button 
            onClick={handleOpenSubmitModal}
            className="hidden sm:block bg-[#0047AB] text-white px-8 py-3 rounded-xl text-xs font-black hover:bg-blue-800 transition shadow-lg shadow-blue-100 uppercase tracking-widest"
          >
            Submit Exam
          </button>
          <button 
            onClick={() => { if(window.confirm("Exit test? No progress will be saved.")) navigate('/dashboard'); }}
            className="text-slate-400 hover:text-red-500 font-bold text-[10px] md:text-xs uppercase tracking-widest transition-colors"
          >
            Quit
          </button>
        </div>
      </header>

      <main className="flex-grow max-w-[1440px] mx-auto w-full p-4 md:p-8 lg:p-12 flex flex-col lg:flex-row gap-12 lg:px-12">
        <div className="flex-grow space-y-10">
          {!dbService.isSubscribed(user, examType || '') && (
            <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] flex items-center gap-4 text-amber-800">
               <i className="fas fa-info-circle text-2xl opacity-40"></i>
               <p className="text-sm font-medium">You are in <strong>Free Mode</strong>. Access is restricted to the first 15 questions. Subscribe to unlock the complete syllabus.</p>
            </div>
          )}

          {questions.map((q, index) => (
            <section 
              key={q.id} 
              id={`question-${index}`}
              className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-slate-100 flex flex-col"
            >
              <div className="mb-10">
                <div className="inline-block px-4 py-2 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-lg mb-6 tracking-widest shadow-sm">
                   Question {index + 1} of {questions.length}
                </div>
                <h2 className="text-xl md:text-2xl font-bold leading-snug text-slate-900">
                  {q.question}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {q.options.map((option, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: idx }))}
                    className={`flex items-center p-6 rounded-[1.8rem] border-2 transition-all duration-300 group text-left ${
                      answers[q.id] === idx 
                        ? 'border-[#0047AB] bg-blue-50/50 shadow-inner' 
                        : 'border-slate-50 bg-slate-50 hover:border-slate-200 hover:bg-white hover:shadow-md'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black mr-5 text-xs transition-all ${
                      answers[q.id] === idx ? 'bg-[#0047AB] text-white shadow-lg' : 'bg-white text-slate-400 group-hover:text-blue-600'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span className={`text-sm md:text-base transition-colors ${answers[q.id] === idx ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>
                      {option}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <div className="py-16 flex flex-col items-center justify-center space-y-6">
            <button
              onClick={handleOpenSubmitModal}
              className="px-20 py-7 rounded-[2rem] font-black bg-[#0047AB] text-white hover:bg-blue-800 transition shadow-2xl shadow-blue-200 text-2xl tracking-tight transform active:scale-95 flex items-center gap-4"
            >
              FINALIZE & SUBMIT EXAM
              <i className="fas fa-paper-plane text-lg opacity-60"></i>
            </button>
          </div>
        </div>

        <aside className="lg:w-80 shrink-0">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 sticky top-32">
            <div className="flex justify-between items-center mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Navigator</h4>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm">
                {Object.keys(answers).length} / {questions.length} DONE
              </span>
            </div>
            
            <div className="grid grid-cols-5 md:grid-cols-4 gap-2.5">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => scrollToQuestion(idx)}
                  className={`aspect-square rounded-xl flex items-center justify-center font-black text-xs transition-all border ${
                    answers[q.id] !== undefined 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md transform hover:-translate-y-1' 
                      : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 hover:border-slate-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            
            <div className="mt-10 pt-10 border-t border-slate-100">
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-3">
                <div 
                  className="h-full bg-blue-600 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                  style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center px-1">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Progress</span>
                <span className="text-[9px] text-slate-900 font-black">{Math.round((Object.keys(answers).length / questions.length) * 100)}%</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default CBTTest;
