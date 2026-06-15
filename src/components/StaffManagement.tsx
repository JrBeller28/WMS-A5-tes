import React, { useState } from 'react';
import { User, Mail, Shield, Lock, UserPlus, FileCheck } from 'lucide-react';
import { registerUser } from '../lib/auth';

export const StaffManagement = () => {
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('Petugas');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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
      setRegSuccess(`Sukses mendaftarkan ${regName} sebagai ${regRole}!`);
      
      setRegName('');
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
      setRegConfirmPassword('');
    } catch (err: any) {
      setRegError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-blue-600" />
            Manajemen Staff
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm">
            Tambahkan staff atau pengguna baru ke dalam sistem Gudang PSN.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 max-w-3xl">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-blue-500" />
          Formulir Pendaftaran Staff Baru
        </h3>

        <form onSubmit={handleRegister} className="space-y-6">
          {regError && (
            <div className="p-3 bg-red-50 text-red-700 text-sm font-bold border border-red-200 rounded-lg animate-shake">
              {regError}
            </div>
          )}
          {regSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 text-sm font-bold border border-emerald-200 rounded-lg">
              {regSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="regName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Lengkap *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  id="regName"
                  type="text"
                  required
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                  placeholder="Contoh: Iwan Gunawan"
                />
              </div>
            </div>

            <div>
              <label htmlFor="regUsername" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  id="regUsername"
                  type="text"
                  required
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                  placeholder="Contoh: adminA5"
                />
              </div>
            </div>

            <div>
              <label htmlFor="regEmail" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email (Opsional)</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="regEmail"
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                  placeholder="Kosongkan untuk otomatis @gudangpsn.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="regRole" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Akses Peran (Role) *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Shield className="w-5 h-5" />
                </div>
                <select
                  id="regRole"
                  value={regRole}
                  onChange={e => setRegRole(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer appearance-none"
                >
                  <option value="Developer">Developer</option>
                  <option value="Super Admin">Super Admin</option>
                  <option value="Kepala Gudang JKT">Kepala Gudang JKT</option>
                  <option value="Admin A5">Admin A5</option>
                  <option value="Petugas">Petugas</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="regPassword" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="regPassword"
                  type="password"
                  required
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                  placeholder="Min 6 Karakter"
                />
              </div>
            </div>

            <div>
              <label htmlFor="regConfirmPassword" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Konfirmasi Password *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="regConfirmPassword"
                  type="password"
                  required
                  value={regConfirmPassword}
                  onChange={e => setRegConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                  placeholder="Ulangi Password"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-all shadow-md text-sm tracking-wider uppercase cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Menyimpan...' : 'Simpan Staff Baru'}
              {!loading && <UserPlus className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
