
import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { User } from './types.ts';
import { dbService } from './services/dbService.ts';
import LandingPage from './pages/LandingPage.tsx';
import AuthPage from './pages/AuthPage.tsx';
import StudentDashboard from './pages/StudentDashboard.tsx';
import CBTTest from './pages/CBTTest.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import CGPACalculator from './pages/CGPACalculator.tsx';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './services/firebase.ts';

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const element = document.getElementById(hash.replace('#', ''));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
};

const SEOMetadata = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    let title = 'Sirlekas Ventures | Professional Digital Services & CBT Excellence EKSU';
    let description = 'Premier digital service hub beside EKSU Operation Unit. NYSC Accredited Center, professional graphics design, and high-fidelity CBT practice systems for JAMB/WAEC students in Ado-Ekiti.';

    if (pathname === '/') {
      title = 'Sirlekas Ventures | Cyber Café, NYSC Registration & CBT Hub EKSU';
      description = 'Welcome to Sirlekas Ventures at Ekiti State University. Expert Cyber Café services, Accredited NYSC Registration Ekiti, Professional Graphics Design, and Advanced CBT Practice Exams.';
    } else if (pathname.includes('/auth')) {
      title = 'Secure Student Portal Access | Sirlekas Ventures EKSU';
      description = 'Sign in or register for the Sirlekas Excellence Portal to access your CBT mock dashboard and professional tracking tools for EKSU students.';
    } else if (pathname.includes('/dashboard')) {
      title = 'Student Achievement Dashboard | Sirlekas Ventures CBT Hub';
      description = 'Monitor your academic growth, access JAMB/GST mock exams, and manage your professional digital subscriptions at Sirlekas Ventures.';
    } else if (pathname.includes('/test')) {
      title = 'Real-Time CBT Simulation | Sirlekas Ventures JAMB & GST Mock';
      description = 'Immersive exam environment designed for maximum performance in official JAMB, WAEC, and Post-UTME examinations at Sirlekas Ventures EKSU.';
    } else if (pathname.includes('/admin')) {
      title = 'Admin Control Console | Sirlekas Ventures Management';
      description = 'Backend management for the Sirlekas digital repository and student achievement metrics in Ekiti State University.';
    } else if (pathname.includes('/cgpa-calculator')) {
      title = 'Accurate EKSU CGPA Calculator | Sirlekas Digital Hub';
      description = 'Calculate your Semester GPA and Cumulative CGPA with our professional 5.0 scale tool. Includes standard Nigerian university grade conversion charts.';
    }

    document.title = title;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    }
  }, [pathname]);

  return null;
};

const MobileNavLink: React.FC<{ to: string; onClick: () => void; active: boolean; children: React.ReactNode }> = ({ to, children, onClick, active }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`block w-full px-8 py-6 text-3xl font-black tracking-tight rounded-[2.5rem] transition-all duration-300 ${
      active ? 'bg-blue-600 text-white shadow-2xl shadow-blue-200' : 'text-slate-800 hover:bg-slate-50'
    }`}
  >
    {children}
  </Link>
);

const InfoModal = ({ 
  isOpen, 
  onClose, 
  title, 
  content 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  content: React.ReactNode 
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white max-w-lg w-full rounded-[3rem] p-10 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-start mb-8">
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">{title}</h3>
          <button 
            onClick={onClose} 
            className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
        <div className="overflow-y-auto pr-4 text-slate-600 text-lg leading-relaxed custom-scrollbar">
          {content}
        </div>
        <div className="mt-8 pt-8 border-t border-slate-100">
          <button 
            onClick={onClose}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-sm hover:bg-slate-800 transition"
          >
            UNDERSTOOD
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<{ title: string; content: React.ReactNode } | null>(null);
  
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const role = firebaseUser.email === 'admin@cafe.com' ? 'admin' : 'student';
        const syncedUser = await dbService.syncUser(firebaseUser, role);
        setUser(syncedUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };

    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      window.addEventListener('keydown', handleKeydown);
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.height = 'auto';
      window.removeEventListener('keydown', handleKeydown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.height = 'auto';
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [isMobileMenuOpen]);

  const handleLogout = () => {
    dbService.logout();
    setUser(null);
    setIsMobileMenuOpen(false);
    navigate('/');
  };

  const footerContents = {
    help: {
      title: "Help Center",
      content: (
        <div className="space-y-6">
          <p>For immediate assistance, visit us beside EKSU Security Department. Our staff is available Monday - Saturday, 8AM - 6PM.</p>
        </div>
      )
    },
    guide: {
      title: "CBT User Guide",
      content: (
        <div className="space-y-6">
          <p>1. Login to your dashboard.</p>
          <p>2. Select your exam category (JAMB or GST).</p>
          <p>3. Choose a subject and start your mock.</p>
          <p>4. Review results instantly after submission.</p>
        </div>
      )
    },
    privacy: { title: "Privacy Policy", content: <p>We value your privacy. Your academic data is secured and never shared with third parties.</p> },
    terms: { title: "Terms of Service", content: <p>By using Sirlekas Portal, you agree to our academic integrity guidelines.</p> }
  };

  const navItems = [
    { label: 'Home', to: '/' },
    { label: 'Services', to: '/#services' },
    ...(user?.role === 'student' ? [{ label: 'Dashboard', to: '/dashboard' }] : []),
    ...(user?.role === 'admin' ? [{ label: 'Admin', to: '/admin' }] : []),
    { label: 'CGPA Calc', to: '/cgpa-calculator' },
    { label: 'About', to: '/#about' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <ScrollToTop />
      <SEOMetadata />

      <header className="glass-navbar sticky top-0 z-[100] transition-all duration-300">
        <nav className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex justify-between h-20 items-center">
            <Link to="/" className="flex items-center space-x-3 group z-[110]">
              <div className="w-10 h-10 bg-[#0047AB] rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 border-2 border-white overflow-hidden relative">
                <i className="fas fa-square rotate-45 text-[#FFD700] absolute text-xl"></i>
                <span className="relative z-10 text-white font-black text-xs">S</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold tracking-tighter text-slate-900 leading-none">SIRLEKAS</span>
                <span className="text-[10px] font-black tracking-[0.3em] text-[#0047AB] uppercase">VENTURES</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center space-x-8">
              {navItems.map(item => (
                <Link 
                  key={item.label} 
                  to={item.to} 
                  className={`text-sm font-bold transition-colors ${location.pathname === item.to || (item.to.startsWith('/#') && location.hash === item.to.replace('/', '')) ? 'text-blue-600' : 'text-slate-500 hover:text-blue-500'}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center space-x-4 z-[110]">
              {user ? (
                <div className="hidden sm:flex items-center space-x-4">
                  <span className="text-sm font-bold text-slate-900">{user.name.split('@')[0]}</span>
                  <button onClick={handleLogout} className="bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-500 p-2.5 rounded-xl transition-all">
                    <i className="fas fa-sign-out-alt"></i>
                  </button>
                </div>
              ) : (
                <Link to="/auth" className="hidden sm:block bg-[#0047AB] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-800 transition-all">Get Started</Link>
              )}

              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                aria-expanded={isMobileMenuOpen}
                aria-label="Open menu"
                className="md:hidden relative w-12 h-12 flex flex-col items-center justify-center space-y-1.5 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white active:scale-90"
              >
                <span className="block w-6 h-0.5 bg-slate-900"></span>
                <span className="block w-4 h-0.5 bg-slate-900"></span>
                <span className="block w-6 h-0.5 bg-slate-900"></span>
              </button>
            </div>
          </div>
        </nav>
      </header>

      <div 
        className={`fixed inset-0 z-[200] flex transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          aria-hidden="true"
        />

        <div 
          ref={menuRef}
          className={`absolute top-0 right-0 h-[100vh] w-full sm:w-[500px] bg-white shadow-2xl transition-transform duration-[300ms] ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex justify-between items-center px-8 py-8 border-b border-slate-50 flex-shrink-0">
            <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-[#0047AB] rounded-2xl flex items-center justify-center border-2 border-white shadow-lg">
                <span className="text-white font-black text-xl">S</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black text-slate-900 tracking-tighter leading-none">SIRLEKAS</span>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">Ventures Hub</span>
              </div>
            </Link>
            
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="w-14 h-14 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-900 hover:text-red-500 transition-all border border-slate-100"
              aria-label="Close menu"
            >
              <i className="fas fa-times text-2xl"></i>
            </button>
          </div>

          <div className="flex-grow overflow-y-auto px-6 py-10 space-y-12 custom-scrollbar">
            <div className="space-y-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-8 mb-4">Navigation Menu</p>
              <div className="flex flex-col space-y-2">
                {navItems.map(item => (
                  <MobileNavLink 
                    key={item.label} 
                    to={item.to} 
                    active={location.pathname === item.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </MobileNavLink>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-8 mb-4">Account Control</p>
              {user ? (
                <div className="p-8 rounded-[3rem] bg-slate-900 text-white shadow-2xl relative overflow-hidden group">
                  <div className="relative z-10 flex items-center gap-6">
                    <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center border border-white/10 overflow-hidden">
                       <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=0047AB&color=fff`} alt={user.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-2xl font-black tracking-tight leading-none">{user.name.split('@')[0]}</p>
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.25em] mt-3 bg-blue-400/10 px-3 py-1 rounded-lg">Verified {user.role}</p>
                    </div>
                  </div>
                  <div className="mt-10 pt-8 border-t border-white/5 flex justify-between items-center relative z-10">
                    <Link to={user.role === 'admin' ? '/admin' : '/dashboard'} onClick={() => setIsMobileMenuOpen(false)} className="text-xs font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">
                      Enter Portal <i className="fas fa-arrow-right ml-2"></i>
                    </Link>
                    <button onClick={handleLogout} className="text-xs font-black uppercase tracking-widest text-red-400 hover:text-red-300">
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)} className="w-full px-8 py-6 rounded-[2rem] bg-slate-100 text-slate-900 font-black text-2xl text-center hover:bg-slate-200 transition-all">
                    Sign In
                  </Link>
                  <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)} className="w-full px-8 py-6 rounded-[2rem] bg-blue-600 text-white font-black text-2xl text-center hover:bg-blue-700 transition-all">
                    Create Account
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="p-8 border-t border-slate-50 bg-white sticky bottom-0">
            {user?.role !== 'admin' && (
              <button 
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (user) navigate(user.role === 'admin' ? '/admin' : '/dashboard');
                  else window.open('https://wa.me/2347073992036', '_blank');
                }}
                className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black text-xl uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-blue-600 transition-all shadow-xl shadow-slate-100"
              >
                {user ? (
                  <>START CBT PRACTICE <i className="fas fa-play text-xs opacity-60"></i></>
                ) : (
                  <>CHAT ON WHATSAPP <i className="fab fa-whatsapp text-2xl"></i></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="flex-grow">
        {loading ? (
          <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<LandingPage user={user} />} />
            <Route path="/auth" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} /> : <AuthPage onLogin={setUser} />} />
            <Route path="/dashboard" element={user?.role === 'student' ? <StudentDashboard user={user} /> : <Navigate to="/auth" />} />
            <Route path="/test/:examType/:subject" element={user?.role === 'student' ? <CBTTest user={user} /> : <Navigate to="/auth" />} />
            <Route path="/admin" element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/auth" />} />
            <Route path="/cgpa-calculator" element={<CGPACalculator />} />
          </Routes>
        )}
      </main>

      <footer className="bg-slate-50 border-t border-slate-100 py-20">
        <div className="max-w-[1440px] mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-16 items-start lg:px-12">
          <div>
            <Link to="/" className="flex items-center space-x-3 mb-6">
              <div className="w-8 h-8 bg-[#0047AB] rounded-lg flex items-center justify-center border border-white">
                <span className="text-white text-[10px] font-black">S</span>
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tighter uppercase">SIRLEKAS VENTURES</span>
            </Link>
            <p className="text-slate-500 text-base leading-relaxed max-w-xs">
              Empowering scholars at Ekiti State University with world-class digital tools and professional cyber services since 2023.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="font-bold text-slate-900 mb-4">Support Hub</h4>
              <ul className="space-y-4 text-base text-slate-500">
                <li><button onClick={() => setActiveInfo(footerContents.help)} className="hover:text-blue-600 transition-colors">Help Center</button></li>
                <li><button onClick={() => setActiveInfo(footerContents.guide)} className="hover:text-blue-600 transition-colors">CBT User Guide</button></li>
                <li><Link to="/cgpa-calculator" className="hover:text-blue-600 transition-colors">CGPA Calculator</Link></li>
                <li><a href="https://wa.me/2347073992036" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">Contact Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-4">Legal</h4>
              <ul className="space-y-2 text-base text-slate-500">
                <li><button onClick={() => setActiveInfo(footerContents.privacy)} className="hover:text-blue-600 transition-colors">Privacy Policy</button></li>
                <li><button onClick={() => setActiveInfo(footerContents.terms)} className="hover:text-blue-600 transition-colors">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="md:text-right">
            <h4 className="font-bold text-slate-900 mb-4">Connect Socially</h4>
            <div className="flex justify-start md:justify-end space-x-4 mb-8 text-xl">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-[#0047AB] hover:text-white transition-all"><i className="fab fa-facebook-f text-sm"></i></a>
              <a href="https://wa.me/2347073992036" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all"><i className="fab fa-whatsapp text-sm"></i></a>
              <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white hover:bg-slate-700 transition-all"><i className="fab fa-tiktok text-sm"></i></a>
            </div>

            <div className="flex flex-col md:items-end gap-3 mb-8">
              <a href="#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-50 text-emerald-700 font-black text-sm uppercase tracking-tight hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm w-fit">
                <i className="fab fa-whatsapp text-xl"></i> Join Group
              </a>
              <a href="#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-indigo-50 text-indigo-700 font-black text-sm uppercase tracking-tight hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm w-fit">
                <i className="fas fa-bullhorn text-lg"></i> Follow Channel
              </a>
            </div>

            <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">&copy; 2026 Sirlekas Ventures Hub Ekiti</p>
          </div>
        </div>
      </footer>

      <InfoModal 
        isOpen={!!activeInfo} 
        onClose={() => setActiveInfo(null)}
        title={activeInfo?.title || ""}
        content={activeInfo?.content || null}
      />
    </div>
  );
};

export default App;
