import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CGPACourse, CGPARecord, User } from '../types';
import { dbService } from '../services/dbService';

const GRADE_POINTS: Record<string, number> = {
  A: 5,
  'A-': 4,
  'B+': 4.5,
  B: 4,
  'B-': 3.5,
  'C+': 3,
  C: 2.5,
  D: 2,
  E: 1,
  F: 0,
};

const SEMESTERS = ['First Semester', 'Second Semester', 'Summer Semester'];

const newCourse = (): CGPACourse => ({
  id: Math.random().toString(36).slice(2, 11),
  name: '',
  unit: 3,
  grade: 'A',
});

const calculateStats = (courses: CGPACourse[]) => {
  const validCourses = courses.filter((course) => Number(course.unit) > 0);
  const totalUnits = validCourses.reduce((sum, course) => sum + Number(course.unit || 0), 0);
  const totalPoints = validCourses.reduce((sum, course) => sum + Number(course.unit || 0) * (GRADE_POINTS[course.grade] ?? 0), 0);
  const gpa = totalUnits > 0 ? Number((totalPoints / totalUnits).toFixed(2)) : 0;
  return { totalUnits, totalPoints, gpa };
};

const getClassInfo = (score: number) => {
  if (score >= 4.5) return { label: 'First Class', color: 'bg-amber-50 text-amber-700 border-amber-100', icon: 'fa-crown' };
  if (score >= 3.5) return { label: 'Second Class Upper', color: 'bg-blue-50 text-blue-700 border-blue-100', icon: 'fa-award' };
  if (score >= 2.4) return { label: 'Second Class Lower', color: 'bg-slate-50 text-slate-700 border-slate-100', icon: 'fa-medal' };
  if (score >= 1.5) return { label: 'Third Class', color: 'bg-orange-50 text-orange-700 border-orange-100', icon: 'fa-certificate' };
  return { label: 'Needs Urgent Attention', color: 'bg-red-50 text-red-700 border-red-100', icon: 'fa-exclamation-circle' };
};

const formatDate = (value?: number) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

const CGPACalculator: React.FC<{ user: User | null }> = ({ user }) => {
  const [courses, setCourses] = useState<CGPACourse[]>([newCourse()]);
  const [session, setSession] = useState('2025/2026');
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [records, setRecords] = useState<CGPARecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setRecords([]);
      return;
    }

    let active = true;
    setLoadingRecords(true);
    dbService.getCgpaRecords(user.uid)
      .then((items) => {
        if (active) setRecords(items);
      })
      .finally(() => {
        if (active) setLoadingRecords(false);
      });

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const stats = useMemo(() => calculateStats(courses), [courses]);

  const cumulativeStats = useMemo(() => {
    const totalUnits = records.reduce((sum, record) => sum + Number(record.totalUnits || 0), 0);
    const totalPoints = records.reduce((sum, record) => sum + Number(record.totalPoints || 0), 0);
    return {
      totalUnits,
      totalPoints,
      gpa: totalUnits > 0 ? Number((totalPoints / totalUnits).toFixed(2)) : 0,
    };
  }, [records]);

  const classInfo = getClassInfo(cumulativeStats.totalUnits > 0 ? cumulativeStats.gpa : stats.gpa);

  const addCourse = () => setCourses((prev) => [...prev, newCourse()]);

  const removeCourse = (id: string) => {
    setCourses((prev) => (prev.length > 1 ? prev.filter((course) => course.id !== id) : prev));
  };

  const updateCourse = (id: string, field: keyof CGPACourse, value: string | number) => {
    setCourses((prev) => prev.map((course) => (course.id === id ? { ...course, [field]: value } : course)));
  };

  const resetCurrent = () => {
    setCourses([newCourse()]);
    setSemester(SEMESTERS[0]);
  };

  const saveSemester = async () => {
    if (!user?.uid) {
      setMessage({ type: 'error', text: 'Sign in as a student before saving CGPA records.' });
      return;
    }
    if (!session.trim() || !semester.trim()) {
      setMessage({ type: 'error', text: 'Enter the academic session and semester before saving.' });
      return;
    }
    if (stats.totalUnits <= 0) {
      setMessage({ type: 'error', text: 'Add at least one valid course before saving.' });
      return;
    }

    const record: CGPARecord = {
      id: Math.random().toString(36).slice(2, 11),
      userId: user.uid,
      session: session.trim(),
      semester,
      courses: courses.map((course, index) => ({
        ...course,
        name: course.name.trim() || `Course ${index + 1}`,
        unit: Number(course.unit),
      })),
      totalUnits: stats.totalUnits,
      totalPoints: stats.totalPoints,
      gpa: stats.gpa,
      createdAt: Date.now(),
    };

    try {
      setSaving(true);
      await dbService.saveCgpaRecord(user.uid, record);
      const next = await dbService.getCgpaRecords(user.uid);
      setRecords(next);
      setMessage({ type: 'success', text: `${record.session} ${record.semester} saved successfully.` });
      resetCurrent();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Unable to save this CGPA record.' });
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 5000);
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (!user?.uid) return;
    await dbService.deleteCgpaRecord(user.uid, recordId);
    setRecords((prev) => prev.filter((record) => record.id !== recordId));
    setMessage({ type: 'success', text: 'Semester record removed.' });
    window.setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-12 py-8 animate-in fade-in duration-500">
      {message && (
        <div className="fixed top-24 right-4 z-[600] w-[min(420px,calc(100vw-2rem))] animate-in slide-in-from-right duration-300">
          <div className={`rounded-[2rem] border p-5 shadow-2xl bg-white flex items-start gap-4 ${message.type === 'success' ? 'border-emerald-100' : 'border-red-100'}`}>
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <i className={`fas ${message.type === 'success' ? 'fa-check' : 'fa-exclamation-triangle'}`}></i>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                {message.type === 'success' ? 'Saved' : 'Action Required'}
              </p>
              <p className="text-sm font-bold text-slate-900 leading-snug">{message.text}</p>
            </div>
          </div>
        </div>
      )}

      <header className="mb-7 max-w-4xl">
        <p className="text-blue-600 font-black uppercase tracking-[0.25em] text-[10px] mb-3">Academic Planner</p>
        <h1 className="text-4xl md:text-6xl font-black text-slate-950 tracking-tight mb-4">CGPA Calculator</h1>
        <p className="text-slate-500 text-base">Calculate your semester GPA, save it to your profile, and build your cumulative CGPA across sessions with ease.</p>
      </header>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-10">
        <section className="space-y-8">
          <div className="bg-white p-6 md:p-7 rounded-2xl border border-slate-200 shadow-sm">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Academic Session</label>
                <input
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  placeholder="e.g. 2025/2026"
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-black text-slate-900 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-black text-slate-900 focus:ring-4 focus:ring-blue-500/10"
                >
                  {SEMESTERS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="hidden md:grid grid-cols-12 gap-4 px-5">
                <div className="col-span-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Course</div>
                <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Units</div>
                <div className="col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Grade</div>
                <div className="col-span-1"></div>
              </div>

              {courses.map((course, index) => (
                <div key={course.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-2xl items-center border border-transparent hover:border-blue-100 hover:bg-white transition-all">
                  <div className="col-span-12 md:col-span-6 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400 flex-shrink-0">{index + 1}</span>
                    <input
                      value={course.name}
                      onChange={(e) => updateCourse(course.id, 'name', e.target.value)}
                      placeholder="e.g. GST 101"
                      className="w-full bg-transparent outline-none font-bold text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                  <select
                    value={course.unit}
                    onChange={(e) => updateCourse(course.id, 'unit', Number(e.target.value))}
                    className="col-span-6 md:col-span-2 w-full bg-white md:bg-transparent rounded-xl px-4 py-3 outline-none font-black text-slate-900 text-center"
                  >
                    {[1, 2, 3, 4, 5, 6].map((unit) => <option key={unit} value={unit}>{unit} Unit{unit > 1 ? 's' : ''}</option>)}
                  </select>
                  <select
                    value={course.grade}
                    onChange={(e) => updateCourse(course.id, 'grade', e.target.value)}
                    className="col-span-6 md:col-span-3 w-full bg-white md:bg-transparent rounded-xl px-4 py-3 outline-none font-black text-blue-600 text-center"
                  >
                    {Object.entries(GRADE_POINTS).map(([grade, point]) => <option key={grade} value={grade}>{grade} ({point.toFixed(1)})</option>)}
                  </select>
                  <button
                    onClick={() => removeCourse(course.id)}
                    className="col-span-12 md:col-span-1 text-slate-300 hover:text-red-500 transition-colors p-2"
                    title="Remove course"
                  >
                    <i className="fas fa-minus-circle"></i>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-8">
              <button onClick={addCourse} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-50 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition">
                <i className="fas fa-plus"></i>
                Add Course
              </button>
              <button
                onClick={saveSemester}
                disabled={saving}
                className="sm:ml-auto sm:min-w-[300px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <i className="fas fa-save"></i>
                {saving ? 'Saving...' : 'Calculate & Save Semester Result'}
              </button>
            </div>

            {!user && (
              <div className="mt-6 bg-amber-50 border border-amber-100 rounded-2xl p-5 text-sm text-amber-800 font-bold">
                Sign in to save semester records and continue your CGPA history across devices. <Link to="/auth" className="underline">Sign in here</Link>.
              </div>
            )}
          </div>

          <div className="bg-[#081630] rounded-2xl p-7 md:p-8 text-white shadow-xl shadow-blue-900/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4">Current Semester GPA</p>
                <p className="text-6xl font-black tracking-tighter">{stats.gpa.toFixed(2)}</p>
              </div>
              <div className={`border rounded-[2rem] p-5 ${classInfo.color}`}>
                <i className={`fas ${classInfo.icon} mb-3`}></i>
                <p className="font-black uppercase tracking-widest text-xs">{classInfo.label}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Units</p>
                  <p className="text-3xl font-black">{stats.totalUnits}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Points</p>
                  <p className="text-3xl font-black">{stats.totalPoints}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 soft-shadow">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Saved Cumulative CGPA</p>
            <div className="flex items-end gap-3">
              <p className="text-6xl font-black text-slate-900 tracking-tighter">{cumulativeStats.gpa.toFixed(2)}</p>
              <p className="text-slate-300 font-black mb-2">/ 5.0</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saved Units</p>
                <p className="text-2xl font-black text-slate-900">{cumulativeStats.totalUnits}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Semesters</p>
                <p className="text-2xl font-black text-slate-900">{records.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 soft-shadow overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">Semester History</h2>
              <p className="text-sm text-slate-500 mt-1">Saved records are used for the cumulative score above.</p>
            </div>
            <div className="max-h-[560px] overflow-y-auto custom-scrollbar">
              {loadingRecords ? (
                <div className="p-10 text-center text-slate-400 font-bold">Loading records...</div>
              ) : records.length > 0 ? (
                records.slice().reverse().map((record) => (
                  <div key={record.id} className="p-6 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-900">{record.session}</p>
                        <p className="text-xs font-bold text-slate-500 mt-1">{record.semester} . {formatDate(record.createdAt)}</p>
                      </div>
                      <button onClick={() => deleteRecord(record.id)} className="w-9 h-9 rounded-xl bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition">
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-5">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">GPA</p>
                        <p className="font-black text-blue-600">{record.gpa.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Units</p>
                        <p className="font-black text-slate-900">{record.totalUnits}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Courses</p>
                        <p className="font-black text-slate-900">{record.courses.length}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center">
                  <i className="fas fa-folder-open text-slate-200 text-5xl mb-5"></i>
                  <p className="text-slate-400 font-bold text-sm">No saved semesters yet.</p>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-black text-slate-900 mb-4"><i className="far fa-star text-blue-600 mr-3" />Grade Scale (5.0)</h2>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(GRADE_POINTS).map(([grade, point]) => (
                <div key={grade} className="rounded-xl border border-slate-100 bg-slate-50 py-3 text-center">
                  <p className="font-black text-slate-900 text-sm">{grade}</p><p className="text-xs text-slate-500">{point.toFixed(1)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4">Note: F grades earn 0 points and remain part of attempted units.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CGPACalculator;
