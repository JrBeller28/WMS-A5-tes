import React, { useState } from 'react';
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
  const user = getCurrentUser();
  
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
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
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
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Logout">
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
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search SKU, Batch, or Bin..." 
                value={activeSearchValue} // Value dikontrol oleh state
                onChange={(e) => handleSearchChange(e.target.value)} // Memicu perubahan input
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <button className="relative p-2 text-slate-500 hover:text-blue-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <button className="p-2 text-slate-500 hover:text-blue-600 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-[1440px] mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}