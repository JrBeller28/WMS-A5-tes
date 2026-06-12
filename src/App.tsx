/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Layout } from './components/Layout';
import { seedDatabase } from './lib/db';
import { getCurrentUser, logoutUser } from './lib/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Lazy loading components to optimize performance limit JS initial payload
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const Inventory = lazy(() => import('./components/Inventory').then(module => ({ default: module.Inventory })));
const Inbound = lazy(() => import('./components/Inbound').then(module => ({ default: module.Inbound })));
const Outbound = lazy(() => import('./components/Outbound').then(module => ({ default: module.Outbound })));
const StockLedger = lazy(() => import('./components/StockLedger').then(module => ({ default: module.StockLedger })));
const StockBalance = lazy(() => import('./components/StockBalance').then(module => ({ default: module.StockBalance })));
const Login = lazy(() => import('./components/Login').then(module => ({ default: module.Login })));

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState(''); // 1. Tambahkan state untuk menampung kata kunci pencarian
  const [init, setInit] = useState(false);
  const [user, setUser] = useState<{username: string, role: string, name: string, sessionId?: string} | null>(null);

  useEffect(() => {
    // 1. Ambil cached user dari localStorage untuk respon cepat di awal
    const cachedUser = getCurrentUser();
    setUser(cachedUser);

    // 2. Dengarkan status otentikasi Firebase secara asinkron sebelum menjalankan seeding database
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await seedDatabase();
        } catch (err) {
          console.warn("Penyemaian database opsional (non-blocking) info:", err);
        }
        setInit(true);
      } else {
        // Jika tidak ada user masuk di Firebase, kosongkan session dan tampilkan login
        setUser(null);
        setInit(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Monitor concurrent login
  useEffect(() => {
    if (!user) return; 

    if (user.sessionId) {
      const unsubscribe = onSnapshot(doc(db, 'sessions', user.username), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.sessionId !== user.sessionId) {
            // Sesi baru terdeteksi, logout otomatis
            logoutUser();
            setUser(null);
            alert("Sesi telah berakhir atau Anda telah login di perangkat lain.");
          }
        } else {
           // Document doesn't exist, invalid session
           logoutUser();
           setUser(null);
        }
      });
      return () => unsubscribe();
    } else {
      // Security feature: reject injected localstorage without sessionId
      logoutUser();
      setUser(null);
    }
  }, [user]);

  const LoadingFallback = () => (
    <div className="flex items-center justify-center p-12 text-slate-400">
      <div className="w-8 h-8 flex border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
    </div>
  );

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Login onLogin={() => setUser(getCurrentUser())} />
      </Suspense>
    );
  }

  // 2. Fungsi perantara untuk mengosongkan search bar setiap kali admin pindah menu tab
  const handleTabChange = (tab: string) => {
    if (tab !== currentTab) {
      setCurrentTab(tab);
      setSearchQuery(''); 
    }
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
      <Suspense fallback={<LoadingFallback />}>
        {renderContent()}
      </Suspense>
    </Layout>
  );
}
