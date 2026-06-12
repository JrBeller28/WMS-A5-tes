import React, { useState } from 'react';
import { PackageOpen, Lock, User, Mail, Shield, UserPlus, LogIn } from 'lucide-react';
import { loginUser, registerUser } from '../lib/auth';

export const Login = ({ onLogin }: { onLogin: () => void }) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  
  // Sign In States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Register States
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('Petugas');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginUser(username, password);
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!regName.trim() || !regUsername.trim() || !regPassword) {
      setRegError("Mohon lengkapi semua field bertanda bintang (*).");
      return;
    }

    if (regPassword.length < 6) {
      setRegError("Password harus minimal 6 karakter.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      const email = regEmail.trim() || `${regUsername.trim().toLowerCase()}@gudangpsn.com`;
      await registerUser(regName, regUsername, email, regRole, regPassword);
      setRegSuccess(`Sukses mendaftarkan ${regName} sebagai ${regRole}! Silakan beralih ke tab Masuk.`);
      
      // Clear forms
      setRegName('');
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
      setRegConfirmPassword('');
      
      // Auto switch back to signin tab after 3 seconds
      setTimeout(() => {
        setActiveTab('signin');
        setUsername(regUsername || email);
        setRegSuccess('');
      }, 3000);
    } catch (err: any) {
      setRegError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 overflow-hidden">
        
        {/* Brand Header */}
        <div className="bg-[#0055C4] p-8 text-center text-white">
          <div className="mx-auto bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
            <PackageOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-[#F1B122]">GUDANG PSN</h1>
          <p className="text-white/80 text-sm mt-2 font-medium">Warehouse Management System</p>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => { setActiveTab('signin'); setError(''); }}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'signin'
                ? 'text-[#0055C4] border-[#0055C4] bg-white'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Masuk (Sign In)
          </button>
          <button
            onClick={() => { setActiveTab('register'); setRegError(''); }}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'register'
                ? 'text-[#0055C4] border-[#0055C4] bg-white'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Daftar Staff Baru
          </button>
        </div>
        
        <div className="p-8">
          
          {/* Sign In Form */}
          {activeTab === 'signin' && (
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="p-3.5 bg-red-50 text-red-700 text-xs font-bold border border-red-200 rounded-lg text-center animate-shake">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username / Email</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <User className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <input
                      id="username"
                      type="text"
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all placeholder-slate-400"
                      placeholder="Masukkan Username atau Email"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all placeholder-slate-400"
                      placeholder="Masukkan Password"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0055C4] hover:bg-blue-800 text-white font-bold py-3.5 rounded-lg transition-all shadow-md text-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Memproses Masuk...' : 'Sign In to System'}
              </button>
            </form>
          )}

          {/* Registration Form */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              {regError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200 rounded-lg text-center">
                  {regError}
                </div>
              )}
              {regSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 rounded-lg text-center animate-pulse">
                  {regSuccess}
                </div>
              )}

              <div className="space-y-3">
                {/* Full Name */}
                <div>
                  <label htmlFor="regName" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nama Lengkap *</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      id="regName"
                      type="text"
                      required
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all"
                      placeholder="Contoh: Iwan Gunawan"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label htmlFor="regUsername" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Username *</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      id="regUsername"
                      type="text"
                      required
                      value={regUsername}
                      onChange={e => setRegUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all"
                      placeholder="Contoh: adminA5"
                    />
                  </div>
                </div>

                {/* Optional Email */}
                <div>
                  <label htmlFor="regEmail" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email (Opsional)</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="regEmail"
                      type="email"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all"
                      placeholder="Kosongkan untuk otomatis @gudangpsn.com"
                    />
                  </div>
                </div>

                {/* Role dropdown */}
                <div>
                  <label htmlFor="regRole" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Akses Peran (Role) *</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Shield className="w-4 h-4" />
                    </div>
                    <select
                      id="regRole"
                      value={regRole}
                      onChange={e => setRegRole(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-bold focus:ring-2 focus:ring-[#0055C4] outline-none cursor-pointer appearance-none"
                    >
                      <option value="Super Admin">Super Admin</option>
                      <option value="Kepala Gudang JKT">Kepala Gudang JKT</option>
                      <option value="Admin A5">Admin A5</option>
                      <option value="Petugas">Petugas</option>
                    </select>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="regPassword" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Password *</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="regPassword"
                      type="password"
                      required
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all"
                      placeholder="Min 6 Karakter"
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="regConfirmPassword" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Konfirmasi Password *</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="regConfirmPassword"
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={e => setRegConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all"
                      placeholder="Ulangi Password"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-[#F1B122] hover:bg-[#d69818] text-slate-900 font-black py-2.5 rounded-lg transition-all shadow-md text-xs tracking-wider uppercase cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Sedang Mendaftarkan...' : 'Daftarkan Staff Baru'}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 font-medium">
              Sistem Otentikasi terenkripsi via Firebase Security & Role-Based Access Control (RBAC).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
