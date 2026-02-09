
import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { dbService } from '../services/dbService';
import { emailService } from '../services/emailService';
import { User } from '../types';

interface AuthPageProps {
  onLogin: (user: User) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuthError = (err: any) => {
    console.error('Auth Error:', err);
    const code = err?.code || '';
    const message = err?.message || '';

    if (code === 'auth/user-not-found' || /user-not-found/i.test(code) || /user-not-found/i.test(message)) {
      setError('No student found with this email');
      return;
    }

    if (code === 'auth/wrong-password') {
      setError('Incorrect security key.');
      return;
    }

    if (code === 'auth/email-already-in-use') {
      setError('Email already registered.');
      return;
    }

    setError('Authentication failed. Please check your credentials.');
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    let focusListener = () => {};
    const removeFocusListener = () => window.removeEventListener('focus', focusListener);

    try {
      focusListener = () => {
        setTimeout(() => {
          if (!auth.currentUser) {
            setError('Google sign-in cancelled.');
            setLoading(false);
            removeFocusListener();
          }
        }, 300);
      };

      window.addEventListener('focus', focusListener);

      const result: any = await Promise.race([
        signInWithPopup(auth, googleProvider),
        new Promise((_, reject) => setTimeout(() => reject(new Error('auth/popup-timeout')), 15000))
      ]);

      const role = result.user.email === 'admin@cafe.com' ? 'admin' : 'student';
      const user = await dbService.syncUser(result.user, role);
      onLogin(user);
      removeFocusListener();
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      removeFocusListener();
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Use Firebase's standard reset which triggers a link
      await sendPasswordResetEmail(auth, email);
      
      // We also trigger our styled EmailJS notification if needed, 
      // but Firebase sends the actual functional link.
      setSuccess('Reset link sent to your email address!');
      setTimeout(() => setIsForgotPassword(false), 3000);
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let result;
      if (isRegister) {
        result = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        result = await signInWithEmailAndPassword(auth, email, password);
      }
      
      const role = email.toLowerCase() === 'admin@cafe.com' ? 'admin' : 'student';
      const user = await dbService.syncUser(result.user, role);
      onLogin(user);
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  if (isForgotPassword) {
    return (
      <div className="min-h-[90vh] flex items-center justify-center px-4 py-20 bg-slate-50">
        <div className="max-w-md w-full bg-white p-12 rounded-[3.5rem] soft-shadow border border-slate-100 animate-in zoom-in-95 duration-500">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900 mb-2">Reset Password</h2>
            <p className="text-slate-500 text-sm">Enter email to receive reset link</p>
          </div>
          {error && <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-black rounded-2xl border border-red-100">{error}</div>}
          {success && <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 text-xs font-black rounded-2xl border border-emerald-100">{success}</div>}
          <form onSubmit={handleForgotPassword} className="space-y-6">
            <input
              type="email"
              required
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-[#0047AB] transition-all"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0047AB] text-white py-5 rounded-2xl font-black hover:bg-blue-800 transition-all"
            >
              {loading ? "SENDING..." : "SEND RESET LINK"}
            </button>
            <button
              type="button"
              onClick={() => setIsForgotPassword(false)}
              className="w-full text-slate-400 font-bold text-sm"
            >
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[90vh] flex items-center justify-center px-4 py-20 relative bg-slate-50">
      <div className="max-w-md w-full bg-white p-12 md:p-14 rounded-[3.5rem] soft-shadow border border-slate-100 relative z-10 animate-in zoom-in-95 duration-500">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#0047AB] rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-100 border-2 border-white overflow-hidden relative">
            <i className="fas fa-square rotate-45 text-[#FFD700] absolute text-3xl"></i>
            <span className="relative z-10 text-white font-black text-xl">S</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
            {isRegister ? 'Join Excellence' : 'Access Portal'}
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            Authorized portal access for students & staff
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 text-red-600 text-xs font-black rounded-2xl text-center border border-red-100 animate-in shake-in duration-300">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-3.5 rounded-full font-bold text-slate-700 hover:bg-slate-50 transition-all transform active:scale-95 shadow-sm hover:shadow-md mb-8"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="text-sm">Continue with Google</span>
            </>
          )}
        </button>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
            <span className="bg-white px-4">OR USE CREDENTIALS</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <input
              type="email"
              required
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-[#0047AB] transition-all"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <input
              type="password"
              required
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-[#0047AB] transition-all"
              placeholder="Security Key / Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {!isRegister && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0047AB] text-white py-5 rounded-2xl font-black text-lg hover:bg-blue-800 transition-all flex items-center justify-center"
          >
            {loading ? <div className="w-6 h-6 border-4 border-white/30 border-t-white animate-spin rounded-full"></div> : (isRegister ? 'CREATE ACCOUNT' : 'LOGIN TO PORTAL')}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-blue-600 font-black hover:text-blue-800 transition-colors text-sm"
          >
            {isRegister ? 'Already have an account? Log In' : 'New student? Register Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
