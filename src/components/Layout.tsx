import React from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  Box, 
  LogIn, 
  LogOut, 
  History, 
  Settings, 
  Bell, 
  Search 
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, currentTab, onTabChange }: LayoutProps) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Box },
    { id: 'inbound', label: 'Inbound', icon: LogIn },
    { id: 'outbound', label: 'Outbound', icon: LogOut },
    { id: 'ledger', label: 'Stock Ledger', icon: History },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-40">
        <div className="px-6 py-8">
          <h1 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Gudang PSN
          </h1>
          <p className="text-sm text-slate-500 mt-1">Warehouse Operations</p>
        </div>
        
        <nav className="flex-1 mt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
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
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              AR
            </div>
            <div className="text-left hidden md:block">
              <p className="text-sm font-bold text-slate-800">Alex Rivera</p>
              <p className="text-xs text-slate-500">Senior Supervisor</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-30 sticky top-0">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search SKU, Batch, or Bin..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
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
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
