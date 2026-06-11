import React, { useState, useEffect, useMemo } from 'react';
import { LogOut, Save, Printer, CheckCircle, Package, Layers, AlertTriangle, Info } from 'lucide-react';
import { Product } from '../types';
import { getProducts, getTransactions, addTransaction, updateTransactionStatus, getLocators } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '../lib/auth';

interface LocatorType {
  id: string;
  rack: string;
  [key: string]: any;
}

export function Outbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locators, setLocators] = useState<LocatorType[]>([]);
  
  // Form State
  const [selectedSku, setSelectedSku] = useState('');
  const [targetQty, setTargetQty] = useState('');
  const [memo, setMemo] = useState('');
  
  // Stock & Allocation State
  const [availableStock, setAvailableStock] = useState<{locatorId: string, available: number, rack: string}[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  
  const [bookedTransactions, setBookedTransactions] = useState<any[]>([]);

  const refreshBookedTransactions = () => {
    getTransactions().then(txs => {
        setBookedTransactions(txs.filter(tx => tx.status === 'BOOKED' && tx.type === 'OUTBOUND'));
    }).catch(console.error);
  }

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error);
    getLocators().then(setLocators).catch(console.error);
    refreshBookedTransactions();
  }, []);

  // 1. Fetch stok per locator saat SKU dipilih
  useEffect(() => {
    if (!selectedSku) {
      setAvailableStock([]);
      setAllocations({});
      return;
    }

    getTransactions().then(txs => {
      const locatorStock: Record<string, number> = {};
      for (const tx of txs) {
        if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
        if (tx.sku === selectedSku) {
          if (!locatorStock[tx.locatorId]) locatorStock[tx.locatorId] = 0;
          locatorStock[tx.locatorId] += tx.qty;
        }
      }
      
      const available = Object.entries(locatorStock)
        .filter(([_, qty]) => qty > 0)
        .map(([locId, qty]) => {
          const locInfo = locators.find(l => l.id === locId);
          return { locatorId: locId, available: qty, rack: locInfo ? locInfo.rack : '-' };
        });
        
      setAvailableStock(available);
      setAllocations({});
    }).catch(console.error);
  }, [selectedSku, locators]);

  // 2. Auto-alokasi stok saat target Qty diisi (Konsep FIFO sederhana)
  useEffect(() => {
    const qty = parseInt(targetQty);
    if (!qty || qty <= 0 || availableStock.length === 0) {
      setAllocations({});
      return;
    }

    let remaining = qty;
    const newAlloc: Record<string, number> = {};

    for (const stock of availableStock) {
      if (remaining <= 0) break;
      const take = Math.min(stock.available, remaining);
      newAlloc[stock.locatorId] = take;
      remaining -= take;
    }

    setAllocations(newAlloc);
  }, [targetQty, availableStock]);

  // Handle manual input allocation by user
  const handleAllocationChange = (locatorId: string, val: string) => {
    const numVal = parseInt(val) || 0;
    setAllocations(prev => ({
      ...prev,
      [locatorId]: numVal
    }));
  };

  // Handler Pengelompokan: Memuat kembali seluruh locator dari transaksi manifes yang sama
  const handleReviewPendingGroup = (group: any) => {
    setSelectedSku(group.sku);
    setTargetQty(group.totalQty.toString());
    setMemo(group.memo || '');
    
    const newAllocations: Record<string, number> = {};
    group.items.forEach((item: any) => {
      newAllocations[item.locatorId] = Math.abs(item.qty);
    });
    setAllocations(newAllocations);
  };

  // Calculations for UI Validation
  const totalAvailable = useMemo(() => availableStock.reduce((sum, item) => sum + item.available, 0), [availableStock]);
  const totalAllocated = useMemo(() => Object.values(allocations).reduce((sum, qty) => sum + (qty || 0), 0), [allocations]);
  const isTargetMet = parseInt(targetQty) > 0 && totalAllocated === parseInt(targetQty);
  const isExceedingStock = parseInt(targetQty) > totalAvailable;

  // Mengelompokkan transaksi pending berdasarkan manifestId / kombinasi unik untuk tampilan tabel
  const groupedPendingTransactions = useMemo(() => {
    const groups: Record<string, {
      manifestId: string;
      timestamp: string;
      sku: string;
      memo: string;
      totalQty: number;
      items: any[];
    }> = {};

    bookedTransactions.forEach(tx => {
      // Gunakan manifestId bawaan, atau fallback ke kombinasi SKU + waktu jika data lama tidak punya ID grup
      const groupKey = tx.manifestId || `${tx.sku}-${tx.timestamp}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          manifestId: tx.manifestId || groupKey,
          timestamp: tx.timestamp,
          sku: tx.sku,
          memo: tx.memo || '',
          totalQty: 0,
          items: []
        };
      }
      groups[groupKey].totalQty += Math.abs(tx.qty);
      groups[groupKey].items.push(tx);
    });

    return Object.values(groups);
  }, [bookedTransactions]);

  const handleSaveBook = async () => {
    if (!selectedSku || !targetQty || !isTargetMet) return;
    
    const user = getCurrentUser();
    const manifestId = uuidv4(); // Buat 1 Manifest ID tunggal untuk semua alokasi di form ini
    
    try {
      // Daftarkan transaksi dengan Manifest ID yang sama agar terkelompok
      for (const [locatorId, pickQty] of Object.entries(allocations)) {
        if (pickQty > 0) {
          const tx = {
            id: uuidv4(),
            manifestId, 
            type: 'OUTBOUND' as const,
            sku: selectedSku,
            qty: -pickQty,
            locatorId: locatorId,
            operator: user ? user.name : 'Unknown User',
            timestamp: new Date().toISOString(),
            status: 'BOOKED' as const,
            memo
          };
          await addTransaction(tx);
        }
      }

      // Reset form input utama
      setSelectedSku('');
      setTargetQty('');
      setAllocations({});
      setMemo('');
      refreshBookedTransactions();
    } catch (err: any) {
      alert(err.message || "Error processing outbound transaction");
    }
  };

  const handleConfirm = async () => {
    if (bookedTransactions.length === 0) return;
    try {
      for (const tx of bookedTransactions) {
        await updateTransactionStatus(tx.id, 'CONFIRMED');
      }
      alert('All Manifest Transactions Confirmed!');
      
      // RESET TOTAL FORM & STATE SEPERTI SEMULA
      setSelectedSku('');
      setTargetQty('');
      setAllocations({});
      setMemo('');
      setAvailableStock([]);
      
      refreshBookedTransactions();
    } catch (e: any) {
      alert(e.message || "Error confirming transactions");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Outbound Dispatch</h2>
          <p className="text-slate-500 mt-1 text-sm">Select SKU, define total quantity, and allocate from racks.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* FORM SECTION (Left side - 7 cols) */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
          <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-4">
            <LogOut className="text-blue-600 w-6 h-6" />
            Pick Plan
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-400" />
                Select SKU
              </label>
              <select 
                value={selectedSku} 
                onChange={e => setSelectedSku(e.target.value)}
                className="w-full p-3.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-slate-700"
              >
                <option value="">-- Type or Choose Product --</option>
                {products.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} - {p.name}</option>
                ))}
              </select>
            </div>

            {selectedSku && (
              <div className="md:col-span-2 animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">Total Pick Quantity</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={targetQty}
                    onChange={e => setTargetQty(e.target.value)}
                    placeholder="e.g. 150"
                    min="1"
                    className="w-full p-4 border border-slate-200 rounded-lg bg-slate-50 text-xl font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                  {selectedSku && (
                    <div className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold ${isExceedingStock ? 'text-red-500' : 'text-slate-400'}`}>
                      Max: {totalAvailable}
                    </div>
                  )}
                </div>
                {isExceedingStock && (
                  <p className="text-red-500 text-sm mt-2 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-4 h-4" /> Requested quantity exceeds total available stock!
                  </p>
                )}
              </div>
            )}
          </div>

          {/* RACK/LOCATOR ALLOCATION SECTION */}
          {selectedSku && parseInt(targetQty) > 0 && !isExceedingStock && (
            <div className="mt-4 pt-6 border-t border-slate-100 animate-in fade-in">
              <div className="flex justify-between items-end mb-4">
                <label className="block text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-400" />
                  Locator Allocation
                </label>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${isTargetMet ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  Allocated: {totalAllocated} / {targetQty}
                </span>
              </div>

              {availableStock.length === 0 ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100">
                  No stock available for this SKU.
                </div>
              ) : (
                <div className="space-y-3">
                  {availableStock.map((stock) => {
                    const currentAlloc = allocations[stock.locatorId] || '';
                    const isExceedingLocatorStock = (allocations[stock.locatorId] || 0) > stock.available;

                    return (
                      <div key={stock.locatorId} className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${Number(currentAlloc) > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                        <div>
                          <div className="font-bold text-slate-800">{stock.locatorId}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">Rack: {stock.rack} | Avail: {stock.available}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number"
                            value={currentAlloc}
                            onChange={(e) => handleAllocationChange(stock.locatorId, e.target.value)}
                            className={`w-24 p-2 text-center font-bold border rounded bg-white ${isExceedingLocatorStock ? 'border-red-500 text-red-600 focus:ring-red-500' : 'border-slate-300 text-slate-800 focus:ring-blue-500'}`}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Memo / Notes (Optional)</label>
                  <input 
                    type="text" 
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    placeholder="Reference PO or reason..."
                    className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <button 
                  onClick={handleSaveBook}
                  disabled={!isTargetMet}
                  className="w-full bg-blue-700 text-white py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <Save className="w-5 h-5" />
                  {isTargetMet ? 'Add to Manifest List' : 'Complete Allocation to Save'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* MANIFEST / PRINT SECTION (Right side - 5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {bookedTransactions.length === 0 ? (
            /* EMPTY STATE - Dark Mode Theme */
            <div className="bg-[#1e293b] rounded-xl p-6 shadow-md text-white flex-1 flex flex-col justify-between relative overflow-hidden min-h-[320px]">
              <div className="absolute top-0 right-0 -mr-8 -mt-8 opacity-10">
                <Printer className="w-48 h-48 text-white" />
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-bold mb-1 tracking-wide">Manifest Summary</h3>
                <p className="text-slate-400 text-xs font-normal">Transactions ready for confirmation.</p>
              </div>
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-slate-500 relative z-10">
                <Info className="w-12 h-12 mb-3 opacity-30 text-slate-400" />
                <p className="text-sm font-normal text-slate-400">No items booked yet.</p>
              </div>
            </div>
          ) : (
            /* FILLED STATE - Layout Nota Fisik Terintegrasi */
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col justify-between flex-1 animate-in fade-in">
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 tracking-tight">Manifest Summary</h3>
                
                {/* Dokumen Fisik Nota */}
                <div className="border border-slate-800 rounded-md p-5 bg-white text-slate-900 shadow-sm font-mono">
                  <div className="text-center mb-4">
                    <h4 className="text-lg font-black uppercase tracking-wider text-slate-950">GUDANG PSN</h4>
                    <p className="text-[10px] font-bold tracking-widest text-slate-700 mt-0.5">PENGELUARAN BARANG</p>
                  </div>
                  
                  <div className="border-b border-slate-800 my-3"></div>

                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="pb-1 font-bold">SKU</th>
                        <th className="pb-1 font-bold">RACK</th>
                        <th className="pb-1 font-bold">LOCATOR</th>
                        <th className="pb-1 font-bold text-right">QTY</th>
                        <th className="pb-1 font-bold pl-2">MEMO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 divide-dashed">
                      {bookedTransactions.map(tx => {
                        const locInfo = locators.find(l => l.id === tx.locatorId);
                        return (
                          <tr key={tx.id} className="text-slate-900 font-medium">
                            <td className="py-2 pr-1 truncate max-w-[90px] font-bold">{tx.sku}</td>
                            <td className="py-2 text-slate-700">{locInfo ? locInfo.rack : '-'}</td>
                            <td className="py-2 text-slate-700 font-mono text-[10px]">{tx.locatorId}</td>
                            <td className="py-2 text-right font-black text-slate-950">{Math.abs(tx.qty)}</td>
                            <td className="py-2 pl-2 text-slate-600 text-[10px] truncate max-w-[60px]">{tx.memo || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Garis Tanda Tangan */}
                  <div className="mt-8 flex justify-between px-2 text-[10px]">
                    <div className="text-center">
                      <div className="h-10 border-b border-slate-400 w-24 mx-auto"></div>
                      <p className="font-bold text-slate-700 mt-1 uppercase tracking-wide text-[9px]">Operator</p>
                    </div>
                    <div className="text-center">
                      <div className="h-10 border-b border-slate-400 w-24 mx-auto"></div>
                      <p className="font-bold text-slate-700 mt-1 uppercase tracking-wide text-[9px]">Admin Gudang</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tombol Cetak / Konfirmasi */}
              <div className="mt-5 flex flex-col gap-2.5">
                <button 
                  onClick={() => window.print()}
                  className="w-full bg-[#1e293b] hover:bg-slate-800 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
                >
                  <Printer className="w-4 h-4" />
                  Print PDF
                </button>
                
                <button 
                  onClick={handleConfirm}
                  className="w-full bg-[#059669] hover:bg-emerald-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-md text-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirm Pick (Manifest)
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* PENDING BOOKED TRANSACTIONS LOG - Terkelompok Menjadi 1 Baris Per Transaksi */}
      {groupedPendingTransactions.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 shadow-sm mt-6 animate-in fade-in">
          <div className="flex items-center gap-2.5 mb-5 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c2410c]"></span>
            <h3 className="text-lg font-bold text-[#9a3412] tracking-tight">
              Pending Booked Transactions
            </h3>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f8fafc] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Locator Allocation</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Qty</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {groupedPendingTransactions.map(group => (
                  <tr key={group.manifestId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                      {new Date(group.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 font-mono">
                      {group.sku}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-600">
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((item, idx) => (
                          <span key={idx} className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded border border-slate-200 font-semibold">
                            {item.locatorId} ({Math.abs(item.qty)})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-[#c2410c] font-mono">
                      {group.totalQty}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button 
                        onClick={() => handleReviewPendingGroup(group)}
                        className="text-[#c2410c] font-bold hover:text-[#9a3412] hover:underline transition-colors text-sm"
                      >
                        Review & Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* HIDDEN PRINT AREA - Dioptimalkan untuk Layout Kertas Nota Asli */}
      <div id="print-area" className="printable-content">
        <div className="invoice-box">
          <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
            <h2 className="text-2xl font-black uppercase tracking-widest text-slate-950">GUDANG PSN</h2>
            <p className="font-mono text-xs font-bold mt-1 tracking-widest text-slate-700">PENGELUARAN BARANG (MANIFEST)</p>
          </div>
          
          <table className="w-full text-left mb-6 font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-slate-950">
                <th className="py-2 font-bold">SKU</th>
                <th className="py-2 font-bold">RACK</th>
                <th className="py-2 font-bold">LOCATOR</th>
                <th className="py-2 font-bold text-right">QTY</th>
                <th className="py-2 font-bold pl-4">MEMO</th>
              </tr>
            </thead>
            <tbody>
              {bookedTransactions.map(tx => {
                const locInfo = locators.find(l => l.id === tx.locatorId);
                return (
                  <tr key={tx.id} className="border-b border-slate-300 border-dashed text-slate-900">
                    <td className="py-2.5 font-bold">{tx.sku}</td>
                    <td className="py-2.5">{locInfo ? locInfo.rack : '-'}</td>
                    <td className="py-2.5">{tx.locatorId}</td>
                    <td className="py-2.5 text-right font-black">{Math.abs(tx.qty)}</td>
                    <td className="py-2.5 pl-4 text-slate-600">{tx.memo || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-12 flex justify-between px-8">
            <div className="text-center">
              <div className="h-16 border-b border-slate-400 w-32 mx-auto"></div>
              <p className="font-bold text-xs mt-2 uppercase text-slate-700 tracking-wide">Operator</p>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-slate-400 w-32 mx-auto"></div>
              <p className="font-bold text-xs mt-2 uppercase text-slate-700 tracking-wide">Admin Gudang</p>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        /* Default view: Sembunyikan area cetak khusus */
        #print-area {
          display: none;
        }

        @media print {
          /* Menyembunyikan seluruh elemen utama aplikasi */
          body * {
            visibility: hidden;
          }
          /* Hanya tampilkan kontainer print-area beserta seluruh turunannya */
          #print-area, #print-area * {
            visibility: visible !important;
          }
          #print-area {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .invoice-box {
            padding: 30px;
            background: white;
          }
          /* Mencegah pecahnya baris tabel saat berganti halaman cetak */
          tr {
            page-break-inside: avoid;
          }
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
      `}} />
    </div>
  );
}