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
import { Login } from './components/Login';
import { seedDatabase } from './lib/db';
import { getCurrentUser } from './lib/auth';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [init, setInit] = useState(false);
  const [user, setUser] = useState<{username: string, role: string, name: string} | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
    seedDatabase().then(() => setInit(true)).catch(() => setInit(true));
  }, []);

  if (!user) {
    return <Login onLogin={() => setUser(getCurrentUser())} />;
  }

  const renderContent = () => {
    if (!init) return <div className="p-8 text-center text-slate-500">Initializing Database...</div>;
    switch (currentTab) {
      case 'dashboard': return <Dashboard />;
      case 'inventory': return <Inventory />;
      case 'inbound': return <Inbound />;
      case 'outbound': return <Outbound />;
      case 'ledger': return <StockLedger />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout currentTab={currentTab} onTabChange={setCurrentTab} onLogout={() => setUser(null)}>
      {renderContent()}
    </Layout>
  );
}
