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
import { SplashScreen } from './components/SplashScreen';

// Lazy loading components to optimize performance limit JS initial payload
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const Inventory = lazy(() => import('./components/Inventory').then(module => ({ default: module.Inventory })));
const Inbound = lazy(() => import('./components/Inbound').then(module => ({ default: module.Inbound })));
const Outbound = lazy(() => import('./components/Outbound').then(module => ({ default: module.Outbound })));
const StockLedger = lazy(() => import('./components/StockLedger').then(module => ({ default: module.StockLedger })));
const StockBalance = lazy(() => import('./components/StockBalance').then(module => ({ default: module.StockBalance })));
const Login = lazy(() => import('./components/Login').then(module => ({ default: module.Login })));
const StaffManagement = lazy(() => import('./components/StaffManagement').then(module => ({ default: module.StaffManagement })));
const RackManagement = lazy(() => import('./components/RackManagement').then(module => ({ default: module.RackManagement })));
const MovingRack = lazy(() => import('./components/MovingRack').then(module => ({ default: module.MovingRack })));
const RackScanner = lazy(() => import('./components/RackScanner').then(module => ({ default: module.RackScanner })));
const DeveloperTools = lazy(() => import('./components/DeveloperTools').then(module => ({ default: module.DeveloperTools })));
const ControlStock = lazy(() => import('./components/ControlStock').then(module => ({ default: module.ControlStock })));
const BillingMenu = lazy(() => import('./components/BillingMenu').then(module => ({ default: module.BillingMenu })));
const SuperAdminPanel = lazy(() => import('./components/SuperAdminPanel').then(module => ({ default: module.SuperAdminPanel })));
const OwnerDashboard = lazy(() => import('./components/OwnerDashboard').then(module => ({ default: module.OwnerDashboard })));

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState(''); // 1. Tambahkan state untuk menampung kata kunci pencarian
  const [init, setInit] = useState(false);
  const [user, setUser] = useState<{username: string, role: string, name: string, sessionId?: string} | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // 1. Ambil cached user dari localStorage untuk respon cepat di awal
    const cachedUser = getCurrentUser();
    setUser(cachedUser);
    if (cachedUser?.role === 'Developer') {
      setCurrentTab('superadmin');
    }

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

    // Skip concurrent login checks if we are on a local fallback session
    if (user.sessionId && user.sessionId.startsWith('LOCAL_SESS_')) {
      return;
    }

    if (user.sessionId) {
      const unsubscribe = onSnapshot(doc(db, 'sessions', user.username), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
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
      }, (error) => {
        console.warn("Sessions snapshot listener failed:", error);
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

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (!init) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-500 font-sans">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="font-semibold text-sm">Menghubungkan ke Database...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Login onLogin={() => {
          const loggedUser = getCurrentUser();
          setUser(loggedUser);
          if (loggedUser?.role === 'Developer') {
            setCurrentTab('superadmin');
          } else {
            setCurrentTab('dashboard');
          }
        }} />
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
    
    const role = user?.role || '';
    const isOwnerOrDev = ['OWNER', 'Developer', 'Super Admin'].includes(role);
    const isAdmin = ['ADMIN', 'Super Admin', 'Admin A5'].includes(role);
    const isManager = ['MANAGER', 'Kepala Gudang', 'Kepala Gudang JKT'].includes(role);
    const isPetugas = ['Petugas'].includes(role);

    // Helper functions for auth routes
    const canAccessOps = isAdmin;
    const canAccessManageTransactions = isAdmin || isManager || isPetugas;
    const canAccessReports = isAdmin || isManager;
    const canAccessSettings = isOwnerOrDev;

    switch (currentTab) {
      case 'dashboard': 
        if (['OWNER', 'Developer'].includes(role)) {
           return <OwnerDashboard />;
        }
        return <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'inventory': 
        return canAccessOps ? <Inventory globalSearch={searchQuery} /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'controlstock':
        return (canAccessOps || canAccessReports) ? <ControlStock searchQuery={searchQuery} /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'inbound': 
        return canAccessManageTransactions ? <Inbound globalSearch={searchQuery} /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'outbound': 
        return canAccessManageTransactions ? <Outbound globalSearch={searchQuery} /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'ledger': 
        return canAccessReports ? <StockLedger globalSearch={searchQuery} /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'balance': 
        return canAccessReports ? <StockBalance globalSearch={searchQuery} /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'moving':
        return canAccessOps ? <MovingRack /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'scanner':
        return <RackScanner />;
      case 'staff':
        return canAccessSettings ? <StaffManagement /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'rack':
        return (role === 'Super Admin' || role === 'Developer') ? <RackManagement /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'billing':
        return canAccessSettings ? <BillingMenu /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'superadmin':
        return (role === 'Developer') ? <SuperAdminPanel /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
      case 'developer':
        return (role === 'Developer') ? <DeveloperTools /> : <Dashboard globalSearch={searchQuery} onNavigate={handleTabChange} onSearchQueryChange={setSearchQuery} />;
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
