
import React, { useState, useMemo } from 'react';

interface Course {
  id: string;
  name: string;
  unit: number;
  grade: string;
}

const GRADE_POINTS: { [key: string]: number } = {
  'A': 5,
  'B': 4,
  'C': 3,
  'D': 2,
  'E': 1,
  'F': 0
};

const CGPACalculator: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([
    { id: '1', name: '', unit: 3, grade: 'A' }
  ]);

  const addCourse = () => {
    setCourses([...courses, { id: Math.random().toString(36).substr(2, 9), name: '', unit: 3, grade: 'A' }]);
  };

  const removeCourse = (id: string) => {
    if (courses.length > 1) {
      setCourses(courses.filter(c => c.id !== id));
    }
  };

  const updateCourse = (id: string, field: keyof Course, value: any) => {
    setCourses(courses.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalPoints = 0;
    courses.forEach(c => {
      totalUnits += Number(c.unit);
      totalPoints += (Number(c.unit) * GRADE_POINTS[c.grade]);
    });
    const cgpa = totalUnits > 0 ? (totalPoints / totalUnits).toFixed(2) : "0.00";
    return { totalUnits, totalPoints, cgpa: Number(cgpa) };
  }, [courses]);

  const getClassInfo = (score: number) => {
    if (score >= 4.5) return { label: "First Class", color: "from-amber-400 to-yellow-600", icon: "fa-crown" };
    if (score >= 3.5) return { label: "Second Class (Upper)", color: "from-blue-400 to-indigo-600", icon: "fa-award" };
    if (score >= 2.4) return { label: "Second Class (Lower)", color: "from-slate-400 to-slate-600", icon: "fa-medal" };
    if (score >= 1.5) return { label: "Third Class", color: "from-orange-400 to-orange-600", icon: "fa-certificate" };
    return { label: "Pass / Fail", color: "from-red-400 to-red-600", icon: "fa-exclamation-circle" };
  };

  const classInfo = getClassInfo(stats.cgpa);

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-12 py-16 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row gap-12">
        
        {/* Main Content Area */}
        <div className="flex-grow space-y-8">
          {/* Calculator Header & Inputs */}
          <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-100 soft-shadow">
            <header className="mb-10">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">CGPA Calculator</h1>
              <p className="text-slate-500 text-base">Calculate your semester grade point average and standing.</p>
            </header>

            <div className="space-y-4">
              <div className="hidden md:grid grid-cols-12 gap-4 px-6 mb-2">
                <div className="col-span-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Course Title</div>
                <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Credit Units</div>
                <div className="col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Letter Grade</div>
                <div className="col-span-1"></div>
              </div>

              {courses.map((course, idx) => (
                <div key={course.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 md:p-2 rounded-2xl md:rounded-full items-center border border-transparent hover:border-blue-100 hover:bg-white transition-all group">
                  <div className="col-span-12 md:col-span-6 flex items-center gap-3 md:pl-4">
                    <span className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400 flex-shrink-0">{idx + 1}</span>
                    <input 
                      type="text" 
                      placeholder="e.g. GST 101"
                      className="bg-transparent border-none outline-none font-bold text-slate-700 w-full placeholder:text-slate-300 text-base"
                      value={course.name}
                      onChange={(e) => updateCourse(course.id, 'name', e.target.value)}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <select 
                      className="w-full bg-white md:bg-transparent border-none outline-none font-black text-slate-900 text-center py-2 px-4 rounded-xl text-base"
                      value={course.unit}
                      onChange={(e) => updateCourse(course.id, 'unit', Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6].map(u => <option key={u} value={u}>{u} Units</option>)}
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <select 
                      className="w-full bg-white md:bg-transparent border-none outline-none font-black text-blue-600 text-center py-2 px-4 rounded-xl text-base"
                      value={course.grade}
                      onChange={(e) => updateCourse(course.id, 'grade', e.target.value)}
                    >
                      {Object.keys(GRADE_POINTS).map(g => <option key={g} value={g}>Grade {g}</option>)}
                    </select>
                  </div>
                  <div className="col-span-12 md:col-span-1 flex justify-center">
                    <button 
                      onClick={() => removeCourse(course.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-2"
                      title="Remove Course"
                    >
                      <i className="fas fa-minus-circle"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={addCourse}
              className="mt-8 flex items-center gap-3 text-blue-600 font-black uppercase text-xs tracking-widest hover:text-blue-800 transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <i className="fas fa-plus"></i>
              </div>
              Add Another Course
            </button>
          </div>

          {/* Performance Result Dashboard Banner */}
          <div className="bg-slate-900 rounded-[3.5rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl shadow-blue-900/20">
            {/* Background Decorations */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[80px] -ml-24 -mb-24"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
              
              {/* Left: Score Spotlight */}
              <div className="text-center md:text-left">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4">Estimated Performance</p>
                <div className="flex items-baseline justify-center md:justify-start">
                  <span className="text-8xl font-black tracking-tighter leading-none">{stats.cgpa}</span>
                  <span className="text-2xl font-black text-white/30 ml-4">/ 5.0</span>
                </div>
              </div>

              {/* Center: Classification Badge */}
              <div className="flex flex-col items-center flex-grow">
                <div className={`inline-flex items-center gap-3 px-8 py-4 rounded-[2rem] bg-gradient-to-br ${classInfo.color} shadow-lg shadow-black/20 transform transition-transform hover:scale-105 duration-500`}>
                  <i className={`fas ${classInfo.icon} text-white text-xl`}></i>
                  <span className="font-black uppercase tracking-widest text-sm text-white">
                    {classInfo.label}
                  </span>
                </div>
                <p className="mt-6 text-sm text-white/40 font-medium max-w-[200px] text-center leading-relaxed italic">
                   "Your academic journey is a marathon, not a sprint."
                </p>
              </div>

              {/* Right: Detailed Stats Breakdown */}
              <div className="w-full md:w-auto grid grid-cols-2 md:grid-cols-1 gap-4">
                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-[2rem] min-w-[160px]">
                   <div className="flex items-center gap-3 mb-1">
                     <i className="fas fa-list-ol text-blue-400 text-xs"></i>
                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Total Units</p>
                   </div>
                   <p className="text-3xl font-black">{stats.totalUnits}</p>
                </div>
                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-[2rem] min-w-[160px]">
                   <div className="flex items-center gap-3 mb-1">
                     <i className="fas fa-star text-amber-400 text-xs"></i>
                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Quality Points</p>
                   </div>
                   <p className="text-3xl font-black">{stats.totalPoints}</p>
                </div>
              </div>

            </div>
          </div>

          {/* Grading Guide */}
          <div className="bg-white rounded-[3rem] p-10 border border-slate-100 soft-shadow">
            <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-3">
              <i className="fas fa-info-circle text-blue-600"></i>
              Grade Conversion Guide (Nigerian 5.0 Scale)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { score: "70-100", grade: "A", points: "5.0", color: "bg-emerald-50 text-emerald-600" },
                { score: "60-69", grade: "B", points: "4.0", color: "bg-blue-50 text-blue-600" },
                { score: "50-59", grade: "C", points: "3.0", color: "bg-indigo-50 text-indigo-600" },
                { score: "45-49", grade: "D", points: "2.0", color: "bg-slate-50 text-slate-600" },
                { score: "40-44", grade: "E", points: "1.0", color: "bg-orange-50 text-orange-600" },
                { score: "0-39", grade: "F", points: "0.0", color: "bg-red-50 text-red-600" }
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.score}% Score</p>
                    <span className="text-2xl font-black text-slate-900">{item.grade}</span>
                  </div>
                  <div className={`px-4 py-2 rounded-xl ${item.color} font-black text-xs uppercase tracking-tighter`}>
                    {item.points} GP
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <aside className="lg:w-96 shrink-0">
          <div className="sticky top-32 space-y-6">
            <div className="bg-[#0047AB] p-10 rounded-[3rem] text-white shadow-xl shadow-blue-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <h4 className="text-xl font-bold mb-4">Official Documentation</h4>
              <p className="text-blue-100 text-base leading-relaxed">
                The CGPA (Cumulative Grade Point Average) is computed by dividing the total Quality Points (QP) by the total Credit Units (CU) attempted. 
                Final degree classification is based on the final cumulative score at graduation.
              </p>
            </div>

            <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100">
               <h5 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-sm uppercase tracking-widest">
                 <i className="fas fa-balance-scale text-blue-600"></i>
                 Standardization
               </h5>
               <p className="text-sm text-slate-500 leading-relaxed">
                 Calculations are based on the NUC approved standard grading system used by Ekiti State University (EKSU) and other Nigerian higher institutions.
               </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CGPACalculator;
