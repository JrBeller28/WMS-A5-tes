import React, { useEffect, useState } from 'react';
import { History, ArrowDownLeft, ArrowUpRight, Copy, X } from 'lucide-react';
import { Transaction } from '../types';
import { getTransactions } from '../lib/db';

export function StockLedger() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    getTransactions().then(data => {
        setTransactions(data);
        setLoading(false);
    }).catch(console.error);
  }, []);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <History className="w-6 h-6 text-blue-700" />
          Stock Ledger & Riwayat Transaksi
        </h2>
        <p className="text-slate-500 mt-1 text-sm">
          Daftar seluruh aktivitas inbound dan outbound di dalam gudang.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipe</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Locator</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Qty</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Operator</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500">Memuat data...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500">Belum ada riwayat transaksi.</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {formatDate(tx.timestamp)}
                    </td>
                    <td className="px-6 py-4">
                      {tx.type === 'INBOUND' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider border border-emerald-100">
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          Inbound
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider border border-amber-100">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          Outbound
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 font-mono tracking-tight">
                      {tx.sku}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-600">
                      {tx.locatorId}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold text-right font-mono ${tx.qty > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {tx.qty > 0 ? '+' : ''}{tx.qty}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {tx.operator}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        tx.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        tx.status === 'PENDING' || tx.status === 'BOOKED' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTx && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                Transaction Details
              </h3>
              <button 
                onClick={() => setSelectedTx(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Transaction ID</label>
                  <div className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 break-all">
                    {selectedTx.id}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date & Time</label>
                  <div className="text-sm font-medium text-slate-800 p-2">
                    {formatDate(selectedTx.timestamp)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">SKU</label>
                  <div className="text-lg font-bold font-mono text-blue-900">{selectedTx.sku}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Locator ID</label>
                  <div className="text-lg font-bold font-mono text-slate-800">{selectedTx.locatorId}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-y border-slate-100 py-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                  <div className={`text-xl font-bold font-mono ${selectedTx.qty > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {selectedTx.qty > 0 ? '+' : ''}{selectedTx.qty}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Type</label>
                  <div className="text-sm font-bold text-slate-700 mt-1">{selectedTx.type}</div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                  <div className="text-sm font-bold text-slate-700 mt-1">{selectedTx.status}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Operator</label>
                <div className="text-sm font-medium text-slate-800 py-1">
                  {selectedTx.operator}
                </div>
              </div>

              {selectedTx.memo && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Memo / Notes</label>
                  <div className="text-sm text-slate-700 bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                    {selectedTx.memo}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
               <button 
                onClick={() => setSelectedTx(null)}
                className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
