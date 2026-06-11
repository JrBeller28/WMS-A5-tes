import React, { useEffect, useState } from 'react';
import { Activity, Box, LogIn, LogOut, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { WarehouseVisualizer } from './WarehouseVisualizer';
import { getInventoryStats, getTransactions, getProducts } from '../lib/db';
import { AuditLog } from './AuditLog';
import { getCurrentUser } from '../lib/auth';

export function Dashboard({ 
  globalSearch = '', 
  onNavigate,
  onSearchQueryChange 
}: { 
  globalSearch?: string;
  onNavigate?: (tab: string) => void;
  onSearchQueryChange?: (query: string) => void;
}) {
  const [stats, setStats] = useState<any>(null);
  const [todayInboundVolume, setTodayInboundVolume] = useState<number>(0);
  const [todayOutboundCount, setTodayOutboundCount] = useState<number>(0); // Mengubah nama state dari volume menjadi count
  const [pendingOutboundCount, setPendingOutboundCount] = useState<number>(0);
  const user = getCurrentUser();

  const fetchStats = async () => {
    try {
      const [inventoryStats, txs, products] = await Promise.all([
        getInventoryStats(),
        getTransactions(),
        getProducts()
      ]);

      setStats(inventoryStats);

      // Mapping SKU ke Volume M3 untuk kalkulasi volume Inbound
      const productVolumeMap = products.reduce((acc: Record<string, number>, p: any) => {
        acc[p.sku] = p.volumeM3 || 0;
        return acc;
      }, {});

      const todayString = new Date().toDateString();

      // 1. Akumulasi VOLUME REAL (M³) untuk Inbound HARI INI
      const inboundVolToday = txs
        .filter((tx: any) => 
          tx.type === 'INBOUND' && 
          tx.status !== 'CANCELLED' && 
          new Date(tx.timestamp).toDateString() === todayString
        )
        .reduce((sum: number, tx: any) => {
          const volM3 = productVolumeMap[tx.sku] || 0;
          return sum + (Math.abs(tx.qty || 0) * volM3);
        }, 0);

      // 2. Hitung TOTAL TRANSAKSI Outbound HARI INI (Menggunakan .length & Hapus M3)
      const outboundCountToday = txs
        .filter((tx: any) => 
          tx.type === 'OUTBOUND' && 
          tx.status !== 'CANCELLED' && 
          new Date(tx.timestamp).toDateString() === todayString
        ).length;
      
      // 3. Total antrean Outbound yang masih PENDING atau BOOKED
      const totalPendingOutbound = txs
        .filter((tx: any) => tx.type === 'OUTBOUND' && (tx.status === 'PENDING' || tx.status === 'BOOKED'))
        .length;

      setTodayInboundVolume(inboundVolToday);
      setTodayOutboundCount(outboundCountToday);
      setPendingOutboundCount(totalPendingOutbound);
    } catch (error) {
      console.error("Error fetching dashboard statistics:", error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Operations Dashboard</h2>
          <p className="text-slate-500 mt-1 text-sm">Real-time inventory and flow status</p>
        </div>
        <button 
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Data
        </button>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* 1. Total Occupancy Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Occupancy</p>
            <Box className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex items-end gap-2 mb-2">
            <p className="text-3xl font-bold text-slate-800">{stats?.occupancy || 0}%</p>
            <span className="text-sm font-medium text-emerald-600 pb-1">+2.4%</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="bg-blue-600 h-full" style={{ width: `${stats?.occupancy || 0}%` }}></div>
          </div>
        </div>

        {/* 2. Inbound Per Hari (Volume M³) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inbound Per Hari</p>
            <LogIn className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {todayInboundVolume.toFixed(3)} <span className="text-sm font-semibold text-slate-500 font-mono">M³</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Volume kubikasi masuk hari ini</p>
        </div>

        {/* 3. Outbound Per Hari (JUMLAH TRANSAKSI - TANPA M³) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outbound Per Hari</p>
            <LogOut className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {todayOutboundCount.toLocaleString()} <span className="text-sm font-semibold text-slate-400">Transaksi</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Total order outbound selesai hari ini</p>
        </div>

        {/* 4. Pending Outbound Transactions Card */}
        <div 
          onClick={() => {
            if (onNavigate && onSearchQueryChange) {
              onNavigate('outbound');
              onSearchQueryChange('PENDING'); // or 'BOOKED' / 'PENDING'
            }
          }}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
        >
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">Pending Outbound</p>
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{pendingOutboundCount}</p>
          <p className="text-sm text-slate-500 mt-1">Active manifest queues pending</p>
        </div>

        {/* 5. Stock Alerts Card */}
        <div className="bg-white p-5 rounded-xl border border-red-200 ring-1 ring-red-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Stock Alerts</p>
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-sm font-bold text-slate-800 mb-1">R1 Slot A1.1 near limit</p>
          <p className="text-xs text-red-600 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3 h-3" /> Critical action required
          </p>
        </div>
      </div>

      <div className="mt-8">
        <WarehouseVisualizer />
      </div>

      {user && (user.role === 'Super Admin' || user.role === 'Kepala Gudang JKT') && (
        <div className="mt-12 pt-8 border-t border-slate-200">
          <AuditLog globalSearch={globalSearch} />
        </div>
      )}
    </div>
  );
}