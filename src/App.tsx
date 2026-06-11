/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Inbound } from './components/Inbound';
import { Outbound } from './components/Outbound';
import { StockLedger } from './components/StockLedger';
import { StockBalance } from './components/StockBalance';
import { AuditLog } from './components/AuditLog';
import { Login } from './components/Login';
import { seedDatabase } from './lib/db';
import { getCurrentUser } from './lib/auth';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState(''); // 1. Tambahkan state untuk menampung kata kunci pencarian
  const [init, setInit] = useState(false);
  const [user, setUser] = useState<{username: string, role: string, name: string} | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
    seedDatabase().then(() => setInit(true)).catch(() => setInit(true));
  }, []);

  if (!user) {
    return <Login onLogin={() => setUser(getCurrentUser())} />;
  }

  // 2. Fungsi perantara untuk mengosongkan search bar setiap kali admin pindah menu tab
  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
    setSearchQuery(''); 
  };

  const renderContent = () => {
    if (!init) return <div className="p-8 text-center text-slate-500">Initializing Database...</div>;
    
    switch (currentTab) {
      case 'dashboard': 
        return <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'inventory': 
        return <Inventory globalSearch={searchQuery} />; // 3. Kirim kata kunci lewat prop 'globalSearch'
      case 'inbound': 
        return <Inbound globalSearch={searchQuery} />;
      case 'outbound': 
        return <Outbound globalSearch={searchQuery} />;
      case 'ledger': 
        return <StockLedger globalSearch={searchQuery} />;
      case 'balance': 
        return <StockBalance globalSearch={searchQuery} />;
      default: 
        return <Dashboard globalSearch={searchQuery} />;
    }
  };

  return (
    <Layout 
      currentTab={currentTab} 
      onTabChange={handleTabChange} // Menggunakan fungsi handleTabChange yang mereset search
      onLogout={() => setUser(null)}
      searchQuery={searchQuery}       // 4. Oper nilai state pencarian ke Layout
      onSearchChange={setSearchQuery} // 5. Oper fungsi pengubah state ke Layout
    >
      {renderContent()}
    </Layout>
  );
}