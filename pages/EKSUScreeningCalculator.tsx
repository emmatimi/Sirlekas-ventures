import React, { useMemo, useState } from 'react';

const GRADE_POINTS: Record<string, number> = {
  A1: 10,
  B2: 9,
  B3: 8,
  C4: 7,
  C5: 6,
  C6: 5,
  D7: 0,
  E8: 0,
  F9: 0,
};

const COMMON_SUBJECTS = [
  'English Language',
  'Mathematics',
  'Biology',
  'Chemistry',
  'Physics',
  'Economics',
  'Government',
  'Literature in English',
  'Civic Education',
  'Commerce',
  'Accounting',
  'Geography',
  'Agricultural Science',
  'CRS/IRS',
  'History',
];

const DEFAULT_SUBJECTS = ['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'];

const getRemark = (score: number) => {
  if (score >= 75) {
    return {
      label: 'Strong Aggregate',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      note: 'This is a strong estimate. Still confirm the official cut-off and screening rules for the current admission year.',
    };
  }
  if (score >= 65) {
    return {
      label: 'Good Aggregate',
      color: 'bg-blue-50 text-blue-700 border-blue-100',
      note: 'This is a good estimate, but admission chances still depend on your course, competition, quota, and official EKSU guidance.',
    };
  }
  if (score >= 55) {
    return {
      label: 'Average Aggregate',
      color: 'bg-amber-50 text-amber-700 border-amber-100',
      note: 'This estimate may be enough for some programmes, but competitive courses usually require stronger scores.',
    };
  }
  return {
    label: 'Low Aggregate',
    color: 'bg-red-50 text-red-700 border-red-100',
    note: 'This estimate is low for competitive admission. Check official guidance and consider backup options.',
  };
};

const EKSUScreeningCalculator: React.FC = () => {
  const [jambScore, setJambScore] = useState(220);
  const [sitting, setSitting] = useState<'one' | 'two'>('one');
  const [subjects, setSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [grades, setGrades] = useState<string[]>(['A1', 'A1', 'B2', 'B3', 'C4']);

  const updateSubject = (index: number, value: string) => {
    setSubjects((prev) => prev.map((subject, idx) => (idx === index ? value : subject)));
  };

  const updateGrade = (index: number, value: string) => {
    setGrades((prev) => prev.map((grade, idx) => (idx === index ? value : grade)));
  };

  const stats = useMemo(() => {
    const safeJamb = Math.min(400, Math.max(0, Number(jambScore || 0)));
    const jambContribution = safeJamb / 8;
    const olevelContribution = grades.reduce((sum, grade) => sum + (GRADE_POINTS[grade] || 0), 0);
    const aggregate = Number((jambContribution + olevelContribution).toFixed(2));
    return { safeJamb, jambContribution, olevelContribution, aggregate };
  }, [grades, jambScore]);

  const remark = getRemark(stats.aggregate);

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-8 py-10 animate-in fade-in duration-500">
      <header className="max-w-3xl mb-8">
        <p className="text-blue-600 font-black uppercase tracking-[0.3em] text-[10px] mb-3">EKSU Admission Tool</p>
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-3">Post UTME Calc</h1>
        <p className="text-slate-500 text-base leading-relaxed">
          Estimate your EKSU screening aggregate with your JAMB score, sitting type, five relevant O'Level subjects, and grades.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-8">
        <section className="space-y-5">
          <div className="bg-white rounded-[1.5rem] border border-slate-100 soft-shadow p-5 md:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">JAMB Score</label>
                <input
                  type="number"
                  min={0}
                  max={400}
                  value={jambScore}
                  onChange={(e) => setJambScore(Number(e.target.value))}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-black text-slate-900 focus:ring-4 focus:ring-blue-500/10"
                />
                <p className="text-xs font-bold text-slate-400">Enter your UTME score between 0 and 400.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">O'Level Sitting</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'one', label: 'One Sitting' },
                    { value: 'two', label: 'Two Sittings' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSitting(item.value as 'one' | 'two')}
                      className={`px-4 py-4 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition ${
                        sitting === item.value
                          ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                          : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs font-bold text-slate-400">Choose how your five relevant O'Level subjects were obtained.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[1.5rem] border border-slate-100 soft-shadow p-5 md:p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">O'Level Details</p>
                <h2 className="text-xl font-black text-slate-900">Select Subjects and Grades</h2>
              </div>
              <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                Five subjects
              </span>
            </div>

            <div className="space-y-3">
              {subjects.map((subject, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3 bg-slate-50 rounded-2xl border border-slate-100 p-3">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Subject {index + 1}</label>
                    <select
                      value={subject}
                      onChange={(e) => updateSubject(index, e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-100 outline-none font-bold text-sm text-slate-900"
                    >
                      {[...new Set([...COMMON_SUBJECTS, subject])].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Grade</label>
                    <select
                      value={grades[index]}
                      onChange={(e) => updateGrade(index, e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-100 outline-none font-black text-sm text-slate-900"
                    >
                      {Object.keys(GRADE_POINTS).map((grade) => (
                        <option key={grade} value={grade}>{grade} - {GRADE_POINTS[grade]} pts</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-[1.5rem] p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">How the Estimate Works</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="font-black text-slate-900">JAMB</p>
                <p className="text-slate-500 mt-1">UTME score divided by 8.</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="font-black text-slate-900">O'Level</p>
                <p className="text-slate-500 mt-1">A1=10, B2=9, B3=8, C4=7, C5=6, C6=5.</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="font-black text-slate-900">Aggregate</p>
                <p className="text-slate-500 mt-1">JAMB contribution plus O'Level points.</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="bg-slate-900 text-white rounded-[1.5rem] p-6 shadow-xl shadow-blue-900/10">
            <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.3em] mb-4">Estimated Aggregate</p>
            <div className="flex items-end gap-3">
              <p className="text-6xl font-black tracking-tighter">{stats.aggregate.toFixed(2)}</p>
              <p className="text-white/30 font-black mb-2">/ 100</p>
            </div>
            <div className={`mt-5 rounded-2xl border p-4 ${remark.color}`}>
              <p className="font-black text-sm uppercase tracking-widest">{remark.label}</p>
              <p className="text-xs font-bold leading-relaxed mt-2">{remark.note}</p>
            </div>
          </section>

          <section className="bg-white rounded-[1.5rem] border border-slate-100 soft-shadow p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Score Breakdown</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-4">
                <span className="text-sm font-black text-slate-600">JAMB Contribution</span>
                <span className="font-black text-slate-900">{stats.jambContribution.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-4">
                <span className="text-sm font-black text-slate-600">O'Level Points</span>
                <span className="font-black text-slate-900">{stats.olevelContribution.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between bg-blue-50 rounded-2xl p-4">
                <span className="text-sm font-black text-blue-700">Sitting Type</span>
                <span className="font-black text-blue-700">{sitting === 'one' ? 'One' : 'Two'}</span>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[1.5rem] border border-slate-100 soft-shadow p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Selected Subjects</p>
            <div className="space-y-2">
              {subjects.map((subject, index) => (
                <div key={`${subject}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-slate-600 truncate">{subject}</span>
                  <span className="font-black text-slate-900">{grades[index]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-[1.5rem] border border-slate-100 soft-shadow p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-3">Important Note</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              This calculator estimates aggregate score only. It does not predict admission or course cut-off because universities can change cut-off marks, screening rules, and department requirements.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default EKSUScreeningCalculator;
