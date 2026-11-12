import React, { useState } from 'react';
import { Layers, Loader2, Lock, Mail, ShieldCheck, User, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/CortexContext';

export const AuthGate: React.FC = () => {
  const { login, register, isSubmittingAuth, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleModeSwitch = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    clearAuthError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
    } catch {
      // Error surfaced via authError state
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#080d19] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0e1628] border border-[#1d2b47] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[#18243d] bg-[#0a101d] flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-900/30 ring-1 ring-blue-400/30 shrink-0">
            <Layers className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-white font-mono">
                CORTEX
              </span>
              <span className="text-[11px] font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-md border border-blue-800/40">
                Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Decision Intelligence Platform · Secure Access
            </p>
          </div>
        </div>

        {/* Mode Switch */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#080d19] border border-[#1a253c] text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleModeSwitch('login')}
              className={`py-2 rounded-lg transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('register')}
              className={`py-2 rounded-lg transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Register Account
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {authError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="block text-slate-300 font-semibold mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-name"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full bg-[#111c33] border border-[#1d2b47] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-slate-300 font-semibold mb-1.5">
              Enterprise Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@cortex-enterprise.ai"
                className="w-full bg-[#111c33] border border-[#1d2b47] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-slate-300 font-semibold mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="auth-password"
                type="password"
                required
                minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter password'}
                className="w-full bg-[#111c33] border border-[#1d2b47] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingAuth}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            {isSubmittingAuth ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{mode === 'login' ? 'Authenticating...' : 'Creating Account...'}</span>
              </>
            ) : (
              <span>{mode === 'login' ? 'Sign In to CORTEX' : 'Create Viewer Account'}</span>
            )}
          </button>

          <div className="pt-2 border-t border-[#18243d] flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {mode === 'register'
                ? 'Self-registered accounts are provisioned with least-privilege Viewer access.'
                : 'Protected by HTTP-only JWT cookies & PostgreSQL RBAC enforcement.'}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};

