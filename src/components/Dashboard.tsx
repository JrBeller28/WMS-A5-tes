import React, { useEffect, useState } from 'react';
import { Activity, Box, LogIn, LogOut, AlertTriangle, RefreshCw } from 'lucide-react';
import { WarehouseVisualizer } from './WarehouseVisualizer';
import { getInventoryStats } from '../lib/db';

export function Dashboard() {
  const [stats, setStats] = useState<any>(null);

  const fetchStats = () => {
    getInventoryStats()
      .then(setStats)
      .catch(console.error);
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Inbound</p>
            <LogIn className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats?.inbound || 0}</p>
          <p className="text-sm text-slate-500 mt-1">4 arriving in &lt; 2 hrs</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Outbound</p>
            <LogOut className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-800">{stats?.outbound || 0}</p>
          <p className="text-sm text-slate-500 mt-1">8 priority orders pending</p>
        </div>

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
    </div>
  );
}
