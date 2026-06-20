import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Lock, UserPlus, FileCheck, Users, Search, RefreshCw, Key, CheckCircle2, Cloud } from 'lucide-react';
import { registerUser, USERS, getCurrentUser } from '../lib/auth';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

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

  // States for Staff Listing
  const [staffList, setStaffList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);

  const currentUser = getCurrentUser();

  const fetchStaff = async () => {
    setFetchLoading(true);
    try {
      // Fetch from Firestore users collection
      const querySnapshot = await getDocs(collection(db, 'users'));
      const fbUsers: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fbUsers.push({
          uid: data.uid || doc.id,
          username: data.username,
          name: data.name,
          email: data.email,
          role: data.role,
          isPredefined: false
        });
      });

      // Merge with USERS predefined list to guarantee they're shown
      const mergedList = [...fbUsers];
      USERS.forEach((staticUser) => {
        const exists = fbUsers.some(
          (u) => u.username?.toLowerCase() === staticUser.username.toLowerCase()
        );
        if (!exists) {
          mergedList.push({
            uid: `static-${staticUser.username}`,
            username: staticUser.username,
            name: staticUser.name,
            email: `${staticUser.username.toLowerCase()}@gudangpsn.com`,
            role: staticUser.role,
            isPredefined: true
          });
        }
      });

      // Sort by role precedence, then name
      mergedList.sort((a, b) => {
        const rolePriority: { [key: string]: number } = {
          'Developer': 0,
          'Super Admin': 1,
          'Admin A5': 2,
          'Kepala Gudang JKT': 3,
          'Petugas': 4,
        };
        const pA = rolePriority[a.role] !== undefined ? rolePriority[a.role] : 99;
        const pB = rolePriority[b.role] !== undefined ? rolePriority[b.role] : 99;
        if (pA !== pB) return pA - pB;
        return (a.name || '').localeCompare(b.name || '');
      });

      setStaffList(mergedList);
    } catch (err) {
      console.error('Gagal mengambil daftar staff:', err);
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

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

      // Auto-refresh the staff listing
      fetchStaff();
    } catch (err: any) {
      setRegError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter staff based on search keyword
  const filteredStaff = staffList.filter((staff) => {
    const q = searchQuery.toLowerCase();
    return (
      (staff.name || '').toLowerCase().includes(q) ||
      (staff.username || '').toLowerCase().includes(q) ||
      (staff.email || '').toLowerCase().includes(q) ||
      (staff.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <UserPlus className="w-6 h-6 text-blue-600" />
          Manajemen Staff
        </h2>
        <p className="text-slate-500 mt-1.5 text-sm">
          Kelola hak akses pengguna, daftarkan staff baru, dan monitor akun aktif di Gudang PSN.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Kolom Kiri: Formulir Pendaftaran */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-blue-500" />
            Pendaftaran Baru
          </h3>

          <form onSubmit={handleRegister} className="space-y-5">
            {regError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-bold border border-red-200 rounded-lg">
                {regError}
              </div>
            )}
            {regSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 rounded-lg">
                {regSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="regName" className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Nama Lengkap *</label>
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
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                    placeholder="Contoh: Iwan Gunawan"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="regUsername" className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Username *</label>
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
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                    placeholder="Contoh: adminA5"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="regEmail" className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Email (Opsional)</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="regEmail"
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                    placeholder="Kosongkan untuk otomatis @gudangpsn.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="regRole" className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Akses Peran (Role) *</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Shield className="w-4 h-4" />
                  </div>
                  <select
                    id="regRole"
                    value={regRole}
                    onChange={e => setRegRole(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-bold focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none cursor-pointer appearance-none"
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
                <label htmlFor="regPassword" className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Password *</label>
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
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                    placeholder="Minimal 6 Karakter"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="regConfirmPassword" className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Konfirmasi Password *</label>
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
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder-slate-400"
                    placeholder="Ulangi Password"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 rounded-lg transition-all shadow text-[11px] uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading ? 'Menyimpan...' : 'Simpan Staff'}
                {!loading && <UserPlus className="w-3.5 h-3.5" />}
              </button>
            </div>
          </form>
        </div>

        {/* Kolom Kanan: Daftar Staff */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">Daftar Pengguna / Staff Terdaftar</h3>
              <span className="bg-slate-200/80 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">
                {staffList.length} Total
              </span>
            </div>
            
            <button
              onClick={fetchStaff}
              disabled={fetchLoading}
              className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              title="Refresh Daftar"
            >
              <RefreshCw className={`w-4 h-4 ${fetchLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          <div className="p-4 border-b border-slate-100 bg-white">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari staff berdasarkan nama, username, email atau peran..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-slate-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Nama & Username</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5 text-center">Akses Peran</th>
                  <th className="px-6 py-3.5 text-center">Status Akun</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredStaff.length > 0 ? (
                  filteredStaff.map((staff, idx) => {
                    const isCurrentUser = staff.username === currentUser?.username;
                    return (
                      <tr key={staff.uid || idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            {staff.name}
                            {isCurrentUser && (
                              <span className="bg-blue-100 text-blue-800 text-[9px] font-black px-1.5 py-0.2 rounded uppercase tracking-wide">
                                Anda
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-slate-400 text-[10px] mt-0.5">
                            @{staff.username}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-500">
                          {staff.email}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            staff.role === 'Developer' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            staff.role === 'Super Admin' ? 'bg-red-100 text-red-800 border border-red-200' :
                            staff.role === 'Kepala Gudang JKT' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            staff.role === 'Admin A5' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {staff.role === 'Developer' && <Key className="w-2.5 h-2.5" />}
                            {staff.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {staff.isPredefined ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400" title="Akun pra-konfigurasi, belum aktif di Firestore">
                              <Cloud className="w-3.5 h-3.5 text-slate-300" />
                              Predefined
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600" title="Akun terdaftar aktif di Firestore">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-50" />
                              Aktif
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                      {fetchLoading ? (
                        <div className="flex justify-center items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                          <span>Memuat daftar staff...</span>
                        </div>
                      ) : (
                        <span>Tidak ada staff yang cocok dengan pencarian.</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
