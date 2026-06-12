import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  Box, 
  LogIn, 
  LogOut, 
  History, 
  Settings, 
  Bell, 
  Search,
  Power,
  Scale,
  ShieldAlert
} from 'lucide-react';
import { getCurrentUser, logoutUser } from '../lib/auth';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  // Menambahkan properti Opsional untuk Search agar terhubung secara global
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Layout({ 
  children, 
  currentTab, 
  onTabChange, 
  onLogout,
  searchQuery,
  onSearchChange 
}: LayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const user = getCurrentUser();
  
  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: Transaction[] = [];
      snapshot.forEach((doc) => {
        txs.push(doc.data() as Transaction);
      });
      setRecentTransactions(txs);
    });
    return () => unsubscribe();
  }, []);

  // Membagi transaksi realtime berdasarkan hari
  const groupedTransactions = useMemo(() => {
    const groups: { dateLabel: string; items: Transaction[] }[] = [];
    const absoluteGroups: Record<string, Transaction[]> = {};

    recentTransactions.forEach((tx) => {
      if (!tx.timestamp) return;
      const dateObj = new Date(tx.timestamp);
      
      const dateLabel = dateObj.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      if (!absoluteGroups[dateLabel]) {
        absoluteGroups[dateLabel] = [];
      }
      absoluteGroups[dateLabel].push(tx);
    });

    Object.keys(absoluteGroups).forEach((label) => {
      groups.push({
        dateLabel: label,
        items: absoluteGroups[label]
      });
    });

    return groups;
  }, [recentTransactions]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Fallback state lokal jika App.tsx belum melemparkan state search global (menghindari error)
  const [localSearch, setLocalSearch] = useState('');
  const activeSearchValue = searchQuery !== undefined ? searchQuery : localSearch;

  const handleSearchChange = (value: string) => {
    if (onSearchChange) {
      onSearchChange(value);
    } else {
      setLocalSearch(value);
    }
  };

  const handleLogout = () => {
    logoutUser();
    if (onLogout) onLogout();
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Stock Overview', icon: Box },
    { id: 'inbound', label: 'Inbound', icon: LogIn },
    { id: 'outbound', label: 'Outbound', icon: LogOut },
    { id: 'ledger', label: 'Stock Ledger', icon: History },
    { id: 'balance', label: 'Stock Balance', icon: Scale },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-45 lg:hidden transition-all duration-300"
        />
      )}

      {/* Sidebar - responsive collapse & slide-in */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Gudang PSN
            </h1>
            <p className="text-sm text-slate-500 mt-1">Warehouse Operations</p>
          </div>
          <button 
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-100 transition-colors cursor-pointer"
            title="Tutup Menu"
            aria-label="Tutup Menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <nav className="flex-1 mt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setIsMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-6 py-3 cursor-pointer text-sm font-medium transition-colors ${
                  isActive 
                    ? 'text-blue-700 border-r-4 border-blue-700 bg-blue-50/50' 
                    : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 font-sans">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                {user ? user.name.substring(0, 2).toUpperCase() : 'AR'}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">{user ? user.name : 'Unknown'}</p>
                <p className="text-xs text-slate-500">{user ? user.role : 'Guest'}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Logout" aria-label="Logout">
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 z-30 sticky top-0 gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button 
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="lg:hidden p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Buka Menu"
              aria-label="Buka Menu"
              aria-expanded={isMobileOpen}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="search" 
                placeholder="Search SKU, Batch, or Bin..." 
                aria-label="Search items"
                value={activeSearchValue} // Value dikontrol oleh state
                onChange={(e) => handleSearchChange(e.target.value)} // Memicu perubahan input
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 relative">
            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 text-slate-500 hover:text-blue-600 transition-colors" 
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {recentTransactions.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-12 w-96 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in-50 slide-in-from-top-2 duration-150">
                <div className="p-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-800">Realtime Updates Ledger</h3>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                    {recentTransactions.length} update
                  </span>
                </div>
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  {groupedTransactions.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">Belum ada update aktivitas terbaru</div>
                  ) : (
                    groupedTransactions.map((group) => (
                      <div key={group.dateLabel} className="bg-white">
                        {/* Day Header */}
                        <div className="sticky top-0 bg-slate-100 px-4 py-1.5 text-[11px] font-bold text-slate-600 border-b border-slate-200 flex justify-between">
                          <span>{group.dateLabel}</span>
                          <span className="text-slate-400 font-medium">({group.items.length} aktivitas)</span>
                        </div>
                        {/* Day Items */}
                        <div className="flex flex-col divide-y divide-slate-50">
                          {group.items.map((tx) => (
                            <div key={tx.id} className="p-3.5 hover:bg-slate-50/50 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                  {tx.type === 'INBOUND' ? (
                                    <div className="p-1 px-1.5 bg-emerald-50 rounded text-emerald-600 font-bold text-[10px]">IN</div>
                                  ) : (
                                    <div className="p-1 px-1.5 bg-orange-50 rounded text-orange-600 font-bold text-[10px]">OUT</div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                      {tx.sku}
                                    </p>
                                    <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                      {formatTime(tx.timestamp)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-1">
                                    Jumlah: <span className="font-bold text-slate-700">{Math.abs(tx.qty)}</span> di <span className="font-bold text-slate-700">{tx.locatorId || 'Buffer/Bin'}</span>
                                  </p>
                                  {/* Operator Info */}
                                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-400 bg-slate-50 rounded px-2 py-1 inline-flex max-w-full">
                                    <span className="font-bold text-slate-500 shrink-0">Operator:</span>
                                    <span className="truncate text-slate-600 font-semibold">{tx.operator || 'System'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
          <div className="w-full mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
