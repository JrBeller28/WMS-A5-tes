import React, { useState, useEffect } from 'react';
import { Camera, Shield, CheckCircle2, AlertCircle, Zap, Trash2, Printer } from 'lucide-react';
import { Product, Locator, Transaction } from '../types';
import { getProducts, getPutawayRecommendations, addTransaction, getTransactions, getInventoryDetails, getLocators } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '../lib/auth';

// Interface untuk menampung alokasi sementara dari grid sebelum di-stage
interface TempAllocation {
  locatorId: string;
  qty: number;
  volume: number;
}

export function Inbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [totalQty, setTotalQty] = useState(''); // Total Qty yang datang di dermaga
  const [recommendations, setRecommendations] = useState<Locator[]>([]);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inboundList, setInboundList] = useState<any[]>([]);
  
  const [locators, setLocators] = useState<Locator[]>([]);
  const [inventory, setInventory] = useState<any>({});
  
  // State baru untuk menampung multi-rak yang dipilih dari grid beserta kuantitas pecahannya
  const [tempAllocations, setTempAllocations] = useState<TempAllocation[]>([]);

  // State arsip dokumen cetak manifes
  const [lastPrintedBatch, setLastPrintedBatch] = useState<any[] | null>(null);
  const [printDate, setPrintDate] = useState<string>('');

  useEffect(() => {
    Promise.all([
      getProducts(),
      getTransactions(),
      getLocators(),
      getInventoryDetails()
    ]).then(([prods, txs, locs, inv]) => {
      setProducts(prods);
      const inbounds = txs.filter(tx => tx.type === 'INBOUND').sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
      setTransactions(inbounds);
      setLocators(locs);
      setInventory(inv);
    }).catch(console.error);
  }, []);

  const fetchTransactions = () => {
    Promise.all([getTransactions(), getInventoryDetails()]).then(([txs, inv]) => {
      const inbounds = txs.filter(tx => tx.type === 'INBOUND').sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
      setTransactions(inbounds);
      setInventory(inv);
    }).catch(console.error);
  };

  const productDetails = products.find(p => p.sku === selectedSku);

  const compatibleLocators = locators.filter(l => {
    if (!productDetails?.category) return true;
    return l.zone === productDetails.category;
  });

  // Bersihkan alokasi sementara jika SKU atau Total Qty berubah
  useEffect(() => {
    setTempAllocations([]);
  }, [selectedSku, totalQty]);

  // Hitung sisa kuantitas barang masuk yang belum mendapatkan alokasi rak
  const unallocatedQty = Math.max(0, Number(totalQty || 0) - tempAllocations.reduce((sum, item) => sum + item.qty, 0));

  const handleRecommend = async () => {
    if (!selectedSku || unallocatedQty <= 0) return;
    setLoading(true);
    try {
      const recs = await getPutawayRecommendations(selectedSku, unallocatedQty);
      const filteredRecs = recs.filter(r => !productDetails?.category || r.zone === productDetails.category);
      setRecommendations(filteredRecs);
    } catch (e: any) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRecommend();
    }, 350);
    return () => clearTimeout(timer);
  }, [selectedSku, totalQty, tempAllocations]);

  // Fungsi utilitas kalkulasi kapasitas ruang slot rak
  const getSlotStat = (locId: string) => {
    let usedVol = 0;
    const items: any[] = [];
    
    // 1. Hitung okupansi eksisting di database gudang
    Object.entries(inventory).forEach(([sku, data]: [string, any]) => {
      const pData = products.find(p => p.sku === sku);
      const locQty = data.locators[locId]?.physicalQty || 0;
      if (locQty > 0 && pData) {
        usedVol += locQty * pData.volumeM3;
        items.push({ sku, qty: locQty });
      }
    });
    
    // 2. Hitung akumulasi dari list staging yang siap konfirmasi
    inboundList.filter(i => i.locatorId === locId).forEach(pendingItem => {
      const pData = products.find(p => p.sku === pendingItem.sku);
      if (pData) usedVol += pendingItem.qty * pData.volumeM3;
      const existing = items.find(i => i.sku === pendingItem.sku);
      if (existing) existing.qty += pendingItem.qty;
      else items.push({ sku: pendingItem.sku, qty: pendingItem.qty });
    });

    // 3. Hitung penambahan dari multi-selection grid aktif saat ini
    const activeTemp = tempAllocations.find(t => t.locatorId === locId);
    if (activeTemp && productDetails) {
      usedVol += activeTemp.qty * productDetails.volumeM3;
      const existing = items.find(i => i.sku === selectedSku);
      if (existing) existing.qty += activeTemp.qty;
      else items.push({ sku: selectedSku, qty: activeTemp.qty });
    }
    
    const maxVol = locators.find(r => r.id === locId)?.maxVolumeM3 || 5.4;
    const pct = Math.min(100, Math.round((usedVol / maxVol) * 100));
    return { usedVol, maxVol, pct, items, allocatedQty: activeTemp?.qty || 0 };
  };

  // Fungsi untuk menangani klik multi-rak pada grid visual matrix
  const handleSlotGridClick = (locId: string) => {
    if (!selectedSku) {
      setMessage({ type: 'error', text: 'Tentukan SKU barang terlebih dahulu.' });
      return;
    }
    if (!totalQty || Number(totalQty) <= 0) {
      setMessage({ type: 'error', text: 'Masukkan kuantitas total material masuk.' });
      return;
    }

    // Jika slot sudah terpilih sebelumnya, hapus dari alokasi multi-rak
    if (tempAllocations.some(t => t.locatorId === locId)) {
      setTempAllocations(tempAllocations.filter(t => t.locatorId !== locId));
      return;
    }

    if (unallocatedQty <= 0) {
      setMessage({ type: 'error', text: 'Seluruh kuantitas barang sudah habis teralokasi ke rak.' });
      return;
    }

    const unitVolume = productDetails?.volumeM3 || 0.1;
    const stat = getSlotStat(locId);
    
    // Hitung sisa ruang m3 tersedia di rak target
    const availableVol = Math.max(0, stat.maxVol - stat.usedVol);
    if (availableVol <= 0) {
      setMessage({ type: 'error', text: `Slot Rak ${locId} sudah terisi penuh!` });
      return;
    }

    // Kalkulasi batas maksimal kapasitas unit barang di slot rak tersebut
    const maxQtyForThisSlot = Math.floor(availableVol / unitVolume);
    if (maxQtyForThisSlot <= 0) {
      setMessage({ type: 'error', text: `Sisa volume di Slot ${locId} tidak cukup untuk ukuran 1 unit SKU ini.` });
      return;
    }

    // Ambil kuantitas optimal (potong kuantitas sisa atau penuhi batas maksimal rak)
    const allocatedQty = Math.min(unallocatedQty, maxQtyForThisSlot);

    setTempAllocations([...tempAllocations, {
      locatorId: locId,
      qty: allocatedQty,
      volume: allocatedQty * unitVolume
    }]);
    setMessage(null);
  };

  const handleAddBatchToList = () => {
    if (tempAllocations.length === 0) {
      setMessage({ type: 'error', text: 'Pilih minimal 1 atau beberapa rak pada grid matrix.' });
      return;
    }

    // Pindahkan semua alokasi pecahan multi-rak ke bag staging queue
    const newStagingItems = tempAllocations.map(alloc => ({
      id: uuidv4(),
      sku: selectedSku,
      qty: alloc.qty,
      locatorId: alloc.locatorId,
      name: productDetails?.name || 'Unknown Product',
      volume: alloc.volume
    }));

    setInboundList([...inboundList, ...newStagingItems]);
    
    // Bersihkan state input untuk load barang berikutnya
    setTotalQty('');
    setSelectedSku('');
    setTempAllocations([]);
    setMessage({ type: 'success', text: 'Grup multi-rak berhasil didaftarkan ke antrean.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRemoveItem = (id: string) => {
    setInboundList(inboundList.filter(item => item.id !== id));
  };

  const handleConfirmAll = async () => {
    if (inboundList.length === 0) return;
    try {
      const user = getCurrentUser();
      const operatorName = user ? user.name : 'Warehouse Operator';
      const currentTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      
      const preparedBatch = inboundList.map(item => ({
        ...item,
        operator: operatorName,
        timestamp: currentTime
      }));

      for (const item of preparedBatch) {
        const tx = {
           id: item.id,
           type: 'INBOUND' as const,
           sku: item.sku,
           qty: item.qty,
           locatorId: item.locatorId,
           operator: item.operator,
           timestamp: new Date().toISOString(),
           status: 'CONFIRMED' as const
        };
        await addTransaction(tx);
      }

      setLastPrintedBatch(preparedBatch);
      setPrintDate(currentTime);
      
      setMessage({ type: 'success', text: 'Konfirmasi putaway berhasil! Menyiapkan cetak berkas...' });
      setInboundList([]);
      fetchTransactions();
      
      setTimeout(() => {
        window.print();
        setMessage(null);
      }, 800);

    } catch (e) {
      setMessage({ type: 'error', text: 'Gagal memproses transaksi jaringan.' });
    }
  };

  const recommendedLoc = recommendations[0];

  let rack = 'FL-A';
  if (tempAllocations.length > 0) {
    const lastSelected = compatibleLocators.find(l => l.id === tempAllocations[tempAllocations.length - 1].locatorId);
    if (lastSelected) rack = lastSelected.rack;
  } else if (recommendedLoc) {
    rack = recommendedLoc.rack;
  } else if (compatibleLocators.length > 0) {
    rack = compatibleLocators[0].rack;
  }
  
  const rackLocators = compatibleLocators.filter(l => l.rack === rack);
  const columns = Array.from(new Set(rackLocators.map(l => l.column))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const maxLevel = rack.startsWith('FL') ? 2 : (rackLocators.length > 0 ? Math.max(...rackLocators.map(l => l.level)) : 4);
  const levels = Array.from({length: maxLevel}, (_, i) => maxLevel - i);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* AREA SCREEN ONLY */}
      <div className="print:hidden space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-[#0F294D] tracking-tight">Directed Putaway</h2>
            <p className="text-slate-500 mt-1 text-sm font-medium">Multi-rack routing interface. Klik beberapa rak untuk memecah kuantitas barang volume besar.</p>
          </div>
          <div className="bg-[#009254] text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 shadow-sm">
            <Zap className="w-4 h-4 fill-white" />
            Multi-Slot Allocation Active
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Entry */}
          <section className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-[#24549A]">
              <span className="w-5 h-5 flex items-center gap-0.5">
                <span className="w-1.5 h-full bg-[#24549A] inline-block rounded-sm"></span>
                <span className="w-1.5 h-3/4 bg-[#24549A] inline-block rounded-sm"></span>
              </span>
              Batch Receipt Entry
            </h3>

            <div className="space-y-5 flex-1">
              <div>
                <label className="block text-sm text-[#475569] mb-1.5 font-medium">SKU Barang</label>
                <select 
                  value={selectedSku} 
                  onChange={e => setSelectedSku(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Pilih SKU Material --</option>
                  {products.map(p => (
                    <option key={p.sku} value={p.sku}>{p.sku} - {p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#475569] mb-1.5 font-medium">Total Qty Datang</label>
                  <input 
                    type="number" 
                    value={totalQty}
                    onChange={e => setTotalQty(e.target.value)}
                    placeholder="Contoh: 150"
                    className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                   <label className="block text-sm text-[#475569] mb-1.5 font-medium">Total Vol (m³)</label>
                  <input 
                    type="text" 
                    value={productDetails && totalQty ? (productDetails.volumeM3 * Number(totalQty)).toFixed(2) : '0.00'}
                    readOnly
                    className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-slate-50 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Pemecahan Angka Alokasi Real-time */}
              {Number(totalQty) > 0 && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Belum Terpilih:</span>
                    <span className={`font-bold ${unallocatedQty > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{unallocatedQty} PCS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sudah Terbagi (Multi-Rak):</span>
                    <span className="font-bold text-blue-600">{tempAllocations.reduce((sum, i) => sum + i.qty, 0)} PCS</span>
                  </div>
                </div>
              )}
              
              {tempAllocations.length > 0 && (
                <div className="bg-blue-50/50 border border-blue-200 rounded p-3">
                  <p className="text-xs font-bold text-blue-800 mb-1.5">Rencana Pemecahan Rak Terpilih:</p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {tempAllocations.map(t => (
                      <div key={t.locatorId} className="text-[11px] flex justify-between font-mono text-slate-700 bg-white p-1 px-2 rounded border border-slate-100">
                        <span>Slot {t.locatorId}</span>
                        <span className="font-bold">{t.qty} PCS ({t.volume.toFixed(2)} m³)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {message && (
                <div className={`p-3 rounded text-xs font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700 flex items-start gap-2'}`}>
                  {message.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
                  {message.text}
                </div>
              )}
            </div>

            <div className="pt-4 mt-auto border-t border-slate-100">
              <button 
                onClick={handleAddBatchToList}
                disabled={tempAllocations.length === 0}
                className="w-full bg-[#34d399] font-bold text-slate-900 py-3 rounded text-sm flex items-center justify-center gap-2 hover:bg-[#10b981] transition-colors disabled:opacity-40"
              >
                <Shield className="w-4 h-4" />
                Stage Selected Racks ({tempAllocations.length})
              </button>

              {inboundList.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-black text-slate-700 uppercase">Staging Queue Plan:</h4>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">{inboundList.length} Racks</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {inboundList.map(item => (
                      <div key={item.id} className="text-xs flex justify-between bg-white p-2 rounded border border-slate-200 items-center">
                        <div>
                          <p className="font-bold text-blue-700 font-mono">{item.sku}</p>
                          <p className="text-[10px] text-slate-400">Allocated: <span className="text-slate-800 font-bold">{item.qty} PCS</span> ➔ Slot {item.locatorId}</p>
                        </div>
                        <button onClick={() => handleRemoveItem(item.id)} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={handleConfirmAll}
                    className="w-full mt-3 bg-[#0055C4] font-bold text-white py-3 rounded text-sm flex items-center justify-center gap-2 hover:bg-blue-800 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm All Putaways & Print
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Matrix Board */}
          <section className="col-span-12 lg:col-span-8 flex flex-col gap-4">
            <div className="bg-[#0b5cd5] text-white rounded-lg p-5 shadow-sm">
               <span className="inline-block px-2.5 py-0.5 bg-white/20 text-white text-[9px] font-extrabold tracking-wider rounded-full mb-1.5 uppercase">AI Suggestion Path</span>
               <h3 className="text-xl font-light">Rekomendasi Utama Slot Kosong: <span className="font-mono font-bold underline">{recommendedLoc?.id || '---'}</span></h3>
               <p className="text-xs text-white/70 mt-1">Sistem mendeteksi sisa beban volume optimal gudang berdasarkan matriks kecepatan produk.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex-1">
               <div className="flex justify-between items-center mb-6">
                 <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                   Live Layout Grid Matrix: 
                   <select 
                     value={rack} 
                     onChange={(e) => {
                       const firstLoc = compatibleLocators.find(l => l.rack === e.target.value);
                       if (firstLoc && tempAllocations.length === 0) {
                         // Hanya ganti fokus visual jika tidak ada alokasi gantung
                       }
                     }}
                     className="p-1 border border-slate-200 bg-slate-50 text-slate-800 rounded font-mono font-bold outline-none text-xs"
                   >
                     {Array.from(new Set(compatibleLocators.map(l => l.rack))).map(r => (
                       <option key={r} value={r}>Block Rack {r}</option>
                     ))}
                   </select>
                 </h4>
                 <div className="flex items-center gap-3 text-[9px] font-bold uppercase text-slate-400">
                   <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#e2e8f0]"></span> Vacant</span>
                   <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#34d399]"></span> Full</span>
                   <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border-2 border-rose-500 bg-rose-50"></span> Multi Selected</span>
                 </div>
               </div>

               <div className="relative w-full overflow-x-auto pb-4">
                 <div className="flex flex-col gap-5 w-max min-w-full">
                   {levels.map((lvl) => (
                     <div key={lvl} className="flex relative items-center py-1">
                       <div className="w-12 text-right pr-3 text-[11px] font-mono font-bold text-slate-400">L-{lvl}</div>
                       <div className="flex gap-4">
                         {columns.map(c => {
                           const locId = `${c}.${lvl}`;
                           const isValidLoc = rackLocators.some(l => l.id === locId);
                           if (!isValidLoc) return <div key={c} className="w-28 flex-shrink-0" />;

                           const stat = getSlotStat(locId);
                           const isAllocatedInGrid = tempAllocations.some(t => t.locatorId === locId);
                           const isVacant = stat.pct === 0 && !isAllocatedInGrid;
                           
                           const cardBorderColor = isAllocatedInGrid 
                             ? 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-500/20 scale-[1.02]' 
                             : 'border-slate-200 hover:border-slate-400';
                           
                           return (
                             <div key={c} className="w-28 flex-shrink-0 cursor-pointer" onClick={() => handleSlotGridClick(locId)}>
                                <div className={`w-full bg-white border-2 ${cardBorderColor} rounded-md p-2 relative transition-all`}>
                                   <div className="flex justify-between items-center text-[10px] font-bold text-slate-700 mb-1">
                                     <span>{c.replace('FL-','')}.{lvl}</span>
                                     <span className="text-slate-400">{stat.pct}%</span>
                                   </div>
                                   <div className="h-7 flex flex-col justify-center text-[10px]">
                                     {isAllocatedInGrid ? (
                                       <div className="text-center bg-rose-500 text-white rounded font-bold py-0.5 animate-pulse text-[9px]">
                                         +{stat.allocatedQty} PCS
                                       </div>
                                     ) : isVacant ? (
                                       <span className="text-slate-300 text-center block italic font-medium tracking-wider">EMPTY</span>
                                     ) : (
                                       <>
                                         <p className="font-bold text-slate-800 truncate">{stat.items[0]?.sku || '---'}</p>
                                         <p className="text-[9px] text-slate-400">{stat.items.reduce((acc: number, curr: any) => acc + curr.qty, 0)} Pcs</p>
                                       </>
                                     )}
                                   </div>
                                   <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-1.5">
                                     <div className={`h-full ${isAllocatedInGrid ? 'bg-rose-500' : stat.pct >= 85 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(stat.pct, 100)}%` }}></div>
                                   </div>
                                </div>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          </section>
        </div>

        {/* PREVIEW HASIL KONFIRMASI (Tampil di Layar Bawah) */}
        {lastPrintedBatch && lastPrintedBatch.length > 0 && (
          <section className="bg-white border border-emerald-200 rounded-lg p-6 shadow-sm mt-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-bold text-[#0F294D] flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  Preview Manifes Terakhir
                </h3>
                <p className="text-xs text-slate-500 mt-1">Ref: INB-MULTI-SPLIT • {printDate}</p>
              </div>
              <button 
                onClick={() => window.print()} 
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Cetak Ulang
              </button>
            </div>
            
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="p-3 font-bold border-r border-slate-200 uppercase text-xs">Item SKU</th>
                    <th className="p-3 font-bold border-r border-slate-200 uppercase text-xs">Nama Produk</th>
                    <th className="p-3 font-bold border-r border-slate-200 uppercase text-xs text-center">Kuantitas</th>
                    <th className="p-3 font-bold border-r border-slate-200 uppercase text-xs text-center">Volume</th>
                    <th className="p-3 font-bold uppercase text-xs text-center">Target Slot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lastPrintedBatch.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-mono font-bold text-blue-700 border-r border-slate-200">{item.sku}</td>
                      <td className="p-3 text-slate-700 border-r border-slate-200">{item.name}</td>
                      <td className="p-3 text-center font-bold text-slate-800 border-r border-slate-200">{item.qty} PCS</td>
                      <td className="p-3 text-center text-slate-500 border-r border-slate-200">{item.volume.toFixed(3)} m³</td>
                      <td className="p-3 text-center font-bold bg-slate-50 text-slate-800">{item.locatorId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* AREA PRINT ONLY */}
      <div className="hidden print:block bg-white text-black p-8 font-sans w-full text-sm leading-relaxed">
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">MANIFES BUKTI TANDA TERIMA BARANG (INBOUND)</h1>
            <p className="text-xs text-gray-600 mt-0.5">Sistem WMS Inventory — PT Parahita Prima Sentosa</p>
          </div>
          <div className="text-right">
             <div className="bg-black text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded">DOKUMEN VALID</div>
             <p className="text-[10px] text-gray-500 mt-1">Ref: INB-MULTI-SPLIT</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-gray-50 border border-gray-300 rounded p-4 mb-6 text-xs font-medium">
          <div>
            <p className="text-gray-500">Waktu Validasi Sukses:</p>
            <p className="text-sm font-bold text-gray-900 font-mono">{printDate || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Operator Gudang:</p>
            <p className="text-sm font-bold text-gray-900 uppercase">{lastPrintedBatch && lastPrintedBatch[0]?.operator}</p>
          </div>
        </div>

        <h3 className="text-xs font-black uppercase text-gray-700 tracking-wider mb-2">Daftar Hasil Distribusi Multi-Rak (Putaway Alokasi):</h3>
        <table className="w-full text-left border-collapse border border-gray-300 text-xs mb-8">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="p-3 font-bold border-r border-gray-300 uppercase">Item SKU</th>
              <th className="p-3 font-bold border-r border-gray-300 uppercase">Nama Produk</th>
              <th className="p-3 font-bold text-center border-r border-gray-300 uppercase">Kuantitas Masuk</th>
              <th className="p-3 font-bold text-center border-r border-gray-300 uppercase">Volume Terpakai</th>
              <th className="p-3 font-bold text-center uppercase">Target Slot Rak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {lastPrintedBatch?.map((item, idx) => (
              <tr key={idx} className="font-mono">
                <td className="p-3 font-bold border-r border-gray-300 text-blue-800">{item.sku}</td>
                <td className="p-3 border-r border-gray-300 font-sans text-gray-700">{item.name}</td>
                <td className="p-3 text-center border-r border-gray-300 font-bold font-sans text-sm">{item.qty} PCS</td>
                <td className="p-3 text-center border-r border-gray-300 text-gray-500">{item.volume.toFixed(3)} m³</td>
                <td className="p-3 text-center font-black bg-gray-50 text-gray-900 text-sm">{item.locatorId}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-16 grid grid-cols-2 text-center text-xs pt-8">
          <div className="flex flex-col items-center">
            <p className="text-gray-500 mb-14">Diverifikasi Oleh Staff,</p>
            <div className="w-40 border-b border-black mb-1"></div>
            <p className="font-bold uppercase">{lastPrintedBatch && lastPrintedBatch[0]?.operator}</p>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-gray-500 mb-14">Mengetahui Kepala Gudang,</p>
            <div className="w-40 border-b border-black mb-1"></div>
            <p className="font-bold uppercase">Supervisor Logistik</p>
          </div>
        </div>
      </div>
    </div>
  );
}