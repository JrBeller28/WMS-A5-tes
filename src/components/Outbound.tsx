import React, { useState, useEffect, useMemo } from 'react';
import { Save, Printer, CheckCircle, Layers, AlertTriangle, Eye, X, Zap, RefreshCw } from 'lucide-react';
import { Product } from '../types';
import { getProducts, getTransactions, addTransaction, updateTransactionStatus, getLocators } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '../lib/auth';

interface LocatorType {
  id: string;
  rack: string;
  column: string;
  level: number;
  zone?: string;
  maxVolumeM3?: number;
}

interface ReceiptPreviewData {
  manifestId: string;
  rows: any[];
  operator: string;
  date: string;
  memo: string;
}

export function Outbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locators, setLocators] = useState<LocatorType[]>([]);
  
  // Form State
  const [selectedSku, setSelectedSku] = useState('');
  const [targetQty, setTargetQty] = useState('');
  const [memo, setMemo] = useState('');
  const [editingManifestId, setEditingManifestId] = useState<string | null>(null);
  
  // Stock & Allocation State
  const [availableStock, setAvailableStock] = useState<{locatorId: string, available: number, rack: string}[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  
  // Transactions State
  const [bookedTransactions, setBookedTransactions] = useState<any[]>([]);
  const [allOutboundTransactions, setAllOutboundTransactions] = useState<any[]>([]);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreviewData | null>(null);

  const refreshTransactionsData = () => {
    getTransactions().then(txs => {
        const outboundTxs = txs.filter(tx => tx.type === 'OUTBOUND');
        setAllOutboundTransactions(outboundTxs.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        setBookedTransactions(outboundTxs.filter(tx => tx.status === 'BOOKED'));
    }).catch(console.error);
  };

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error);
    getLocators().then(setLocators).catch(console.error);
    refreshTransactionsData();
  }, []);

  // Memeriksa status kevalidan volume produk secara global di dalam komponen
  const productDetails = products.find(p => p.sku === selectedSku);
  const isVolumeInvalid = selectedSku && (!productDetails || productDetails.volumeM3 === undefined || productDetails.volumeM3 === null || productDetails.volumeM3 <= 0);

  // Ambil data ketersediaan stok material di gudang secara real-time berdasarkan SKU terpilih
  useEffect(() => {
    if (!selectedSku) {
      setAvailableStock([]);
      setAllocations({});
      setMessage(null);
      return;
    }

    // Validasi otomatis jika barang tidak memiliki volume
    if (isVolumeInvalid) {
      setMessage({ 
        type: 'error', 
        text: 'Barang tersebut tidak ada volumenya. Tidak bisa melakukan transaksi, silakan hubungi Super Admin untuk menambahkan volumenya.' 
      });
      setAvailableStock([]);
      setAllocations({});
      return;
    } else {
      setMessage(null);
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
      
      if (!editingManifestId) {
        setAllocations({});
      }
    }).catch(console.error);
  }, [selectedSku, locators, isVolumeInvalid]);

  // Kalkulasi Intuitif Murni untuk Rekomendasi AI
  const aiRecommendedAllocations = useMemo(() => {
    const qty = parseInt(targetQty);
    if (!qty || qty <= 0 || availableStock.length === 0 || isVolumeInvalid) return {};

    let remaining = qty;
    const recommended: Record<string, number> = {};

    for (const stock of availableStock) {
      if (remaining <= 0) break;
      const take = Math.min(stock.available, remaining);
      recommended[stock.locatorId] = take;
      remaining -= take;
    }
    return recommended;
  }, [targetQty, availableStock, isVolumeInvalid]);

  // Set alokasi otomatis saat target qty berubah pertama kali sebagai baseline rekomendasi awal
  useEffect(() => {
    if (editingManifestId) return; 
    setAllocations(aiRecommendedAllocations);
  }, [aiRecommendedAllocations, editingManifestId]);

  const totalAvailable = useMemo(() => availableStock.reduce((sum, item) => sum + item.available, 0), [availableStock]);
  const totalAllocated = useMemo(() => Object.values(allocations).reduce((sum, qty) => sum + (qty || 0), 0), [allocations]);
  const unallocatedQty = Math.max(0, Number(targetQty || 0) - totalAllocated);
  const isTargetMet = parseInt(targetQty) > 0 && totalAllocated === parseInt(targetQty);
  const isExceedingStock = parseInt(targetQty) > totalAvailable && !editingManifestId;

  // Menghasilkan string rekomendasi alokasi slot dinamis untuk banner AI tetap bersih
  const aiRecommendationSlots = useMemo(() => {
    if (!selectedSku) return 'Silakan tentukan SKU material terlebih dahulu';
    if (isVolumeInvalid) return 'Barang tidak valid (volume kosong). Hubungi Super Admin.';
    if (!targetQty || Number(targetQty) <= 0) return 'Masukkan kuantitas target pick untuk memetakan lokasi';
    
    const activeSlots = Object.entries(aiRecommendedAllocations)
      .filter(([_, qty]) => qty > 0)
      .map(([locId, qty]) => `${locId} (${qty} PCS)`)
      .sort();

    if (activeSlots.length === 0) return 'Stok material tidak ditemukan di slot manapun';
    return activeSlots.join(', ');
  }, [aiRecommendedAllocations, selectedSku, targetQty, isVolumeInvalid]);

  const handleReviewPendingGroup = (group: any) => {
    setEditingManifestId(group.manifestId);
    setSelectedSku(group.sku);
    setTargetQty(group.totalQty.toString());
    setMemo(group.memo || '');
    
    const newAllocations: Record<string, number> = {};
    group.items.forEach((item: any) => {
      newAllocations[item.locatorId] = Math.abs(item.qty);
    });
    setAllocations(newAllocations);

    setMessage({ type: 'success', text: 'Data grup berhasil dimuat ke dalam form pembungkusan.' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingManifestId(null);
    setSelectedSku('');
    setTargetQty('');
    setAllocations({});
    setMemo('');
    setMessage(null);
  };

  const handleSaveBook = async () => {
    if (!selectedSku || !targetQty || !isTargetMet) return;
    
    if (isVolumeInvalid) {
      setMessage({ 
        type: 'error', 
        text: 'Tidak dapat menyimpan transaksi. Barang tersebut tidak ada volumenya, silakan hubungi Super Admin untuk menambahkan volumenya.' 
      });
      return;
    }
    
    const user = getCurrentUser();
    const operatorName = user ? user.name : 'IWAN GUNAWAN';
    
    try {
      if (editingManifestId) {
        const oldTransactions = bookedTransactions.filter(tx => tx.manifestId === editingManifestId);
        for (const oldTx of oldTransactions) {
          await updateTransactionStatus(oldTx.id, 'CANCELLED');
        }
      }

      const activeManifestId = editingManifestId || 'MFS-OUT-' + uuidv4().slice(0,8).toUpperCase();
      
      for (const [locatorId, pickQty] of Object.entries(allocations)) {
        if (pickQty > 0) {
          const tx = {
            id: uuidv4(),
            manifestId: activeManifestId, 
            type: 'OUTBOUND' as const,
            sku: selectedSku,
            qty: -pickQty, 
            locatorId: locatorId,
            operator: operatorName,
            timestamp: new Date().toISOString(),
            status: 'BOOKED' as const,
            memo
          };
          await addTransaction(tx);
        }
      }

      setMessage({ 
        type: 'success', 
        text: editingManifestId ? 'Alokasi manifes berhasil diperbarui!' : 'Alokasi berhasil ditambahkan ke manifes pending.' 
      });
      
      setEditingManifestId(null);
      setSelectedSku('');
      setTargetQty('');
      setAllocations({});
      setMemo('');
      refreshTransactionsData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "Gagal menyimpan alokasi." });
    }
  };

  const handleConfirmAllManifest = async () => {
    if (bookedTransactions.length === 0) return;
    try {
      const user = getCurrentUser();
      const operatorName = user ? user.name : 'IWAN GUNAWAN';
      const now = new Date();
      const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${String(now.getFullYear()).slice(-2)}, ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`;

      const primaryManifestId = bookedTransactions[0].manifestId || 'MFS-OUT-' + uuidv4().slice(0,8).toUpperCase();

      const rows = bookedTransactions.map(tx => {
        const prod = products.find(p => p.sku === tx.sku);
        return {
          sku: tx.sku,
          name: prod ? prod.name : 'Unknown Product',
          qty: Math.abs(tx.qty),
          locatorId: tx.locatorId
        };
      });

      for (const tx of bookedTransactions) {
        await updateTransactionStatus(tx.id, 'CONFIRMED');
      }

      setReceiptPreview({
        manifestId: primaryManifestId,
        rows,
        operator: operatorName,
        date: formattedDate,
        memo: bookedTransactions[0].memo || '-'
      });

      setEditingManifestId(null);
      setSelectedSku('');
      setTargetQty('');
      setAllocations({});
      setMemo('');
      setAvailableStock([]);
      refreshTransactionsData();

      setMessage({ type: 'success', text: 'Konfirmasi dispatch sukses! Dokumen nota keluar siap dicetak.' });
      setTimeout(() => setMessage(null), 3500);
    } catch (e: any) {
      setMessage({ type: 'error', text: "Gagal memproses konfirmasi transaksi." });
    }
  };

  // Grouping Antrean Pending Manifest
  const groupedPendingTransactions = useMemo(() => {
    const groups: Record<string, {
      manifestId: string;
      timestamp: string;
      sku: string;
      memo: string;
      totalQty: number;
      items: any[];
      operator: string;
    }> = {};

    bookedTransactions.forEach(tx => {
      const groupKey = tx.manifestId || `${tx.sku}-${tx.timestamp}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          manifestId: tx.manifestId || groupKey,
          timestamp: tx.timestamp,
          sku: tx.sku,
          memo: tx.memo || '',
          totalQty: 0,
          items: [],
          operator: tx.operator || 'SYSTEM'
        };
      }
      groups[groupKey].totalQty += Math.abs(tx.qty);
      groups[groupKey].items.push(tx);
    });

    return Object.values(groups);
  }, [bookedTransactions]);

  // Grouping Utama Semua Riwayat Transaksi Outbound (FIXED UNIQUE KEY)
  const aggregatedHistoryTransactions = useMemo(() => {
    const groups: Record<string, {
      id: string; // Menampung key unik asli transaksi
      manifestId: string;
      timestamp: string;
      sku: string;
      locatorsList: string[];
      totalQty: number;
      operator: string;
      memo: string;
      status: string;
      rawItems: any[];
    }> = {};

    allOutboundTransactions.forEach(tx => {
      const key = tx.manifestId || tx.id;
      if (!groups[key]) {
        groups[key] = {
          id: key, // Menyimpan id pembeda unik agar tidak duplikat saat loop rendering
          manifestId: tx.manifestId || '-',
          timestamp: tx.timestamp,
          sku: tx.sku,
          locatorsList: [],
          totalQty: 0,
          operator: tx.operator || 'SYSTEM',
          memo: tx.memo || '-',
          status: tx.status,
          rawItems: []
        };
      }
      
      if (tx.locatorId && !groups[key].locatorsList.includes(tx.locatorId)) {
        groups[key].locatorsList.push(tx.locatorId);
      }
      groups[key].totalQty += Math.abs(tx.qty);
      groups[key].rawItems.push(tx);
    });

    return Object.values(groups);
  }, [allOutboundTransactions]);

  const handlePreviewHistorical = (group: any) => {
    const txDate = new Date(group.timestamp);
    const formattedDate = `${txDate.getDate()}/${txDate.getMonth() + 1}/${String(txDate.getFullYear()).slice(-2)}, ${String(txDate.getHours()).padStart(2, '0')}.${String(txDate.getMinutes()).padStart(2, '0')}.${String(txDate.getSeconds()).padStart(2, '0')}`;

    const rows = group.rawItems.map((item: any) => {
      const prod = products.find(p => p.sku === item.sku);
      return {
        sku: item.sku,
        name: prod ? prod.name : 'Unknown Product',
        qty: Math.abs(item.qty),
        locatorId: item.locatorId
      };
    });

    setReceiptPreview({
      manifestId: group.manifestId,
      rows,
      operator: group.operator,
      date: formattedDate,
      memo: group.memo || '-'
    });

    setTimeout(() => {
      document.getElementById('thermal-preview-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto p-4">
      
      <div className="print:hidden space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-[#0F294D] tracking-tight">Directed Picking (Outbound)</h2>
            <p className="text-slate-500 mt-1 text-xs">Multi-rack allocation routing interface. Ambil pecahan kuantitas barang dari beberapa rak secara sistematis.</p>
          </div>
          <div className="bg-[#0055C4] text-white px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 shadow-sm">
            <Zap className="w-3.5 h-3.5 fill-white" />
            Custom Admin Control Active
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Form Input Pelayan Gudang */}
          <section className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-1.5 text-[#0055C4] uppercase tracking-wider">
                <span className="w-1 h-4 bg-[#0055C4] block rounded"></span>
                {editingManifestId ? 'Edit Dispatch Entry' : 'Batch Dispatch Entry'}
              </h3>

              {editingManifestId && (
                <div className="mb-3 p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded text-[11px] flex justify-between items-center font-medium">
                  <span>Mengubah Manifest: <strong>{editingManifestId.slice(0, 8)}...</strong></span>
                  <button onClick={handleCancelEdit} className="text-xs underline text-red-600 font-bold hover:text-red-800">Batal</button>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-semibold">SKU Barang Keluar</label>
                  <select 
                    value={selectedSku} 
                    onChange={e => setSelectedSku(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-xs bg-white outline-none focus:border-[#0055C4] font-medium"
                  >
                    <option value="">-- Pilih SKU Material --</option>
                    {products.map(p => (
                      <option key={p.sku} value={p.sku}>{p.sku} - {p.name}</option>
                    ))}
                  </select>
                </div>

                {selectedSku && !isVolumeInvalid && (
                  <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1 font-semibold">Total Qty Pick</label>
                      <input 
                        type="number" 
                        value={targetQty}
                        onChange={e => setTargetQty(e.target.value)}
                        placeholder="Contoh: 50"
                        min="1"
                        className="w-full p-2 border border-slate-300 rounded text-xs outline-none focus:border-[#0055C4] font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1 font-semibold">Stok Tersedia</label>
                      <input 
                        type="text" 
                        value={`${totalAvailable} PCS`}
                        readOnly
                        className={`w-full p-2 border border-slate-300 rounded text-xs font-bold bg-slate-50 ${isExceedingStock ? 'text-red-600' : 'text-slate-700'}`}
                      />
                    </div>
                  </div>
                )}

                {Number(targetQty) > 0 && !isExceedingStock && !isVolumeInvalid && (
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] space-y-1 font-medium animate-fadeIn">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sisa Belum Teralokasi:</span>
                      <span className={`font-bold ${unallocatedQty > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>{unallocatedQty} PCS</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Siap Diambil:</span>
                      <span className="font-bold text-[#0055C4]">{totalAllocated} / {targetQty} PCS</span>
                    </div>
                  </div>
                )}

                {isExceedingStock && !isVolumeInvalid && (
                  <div className="p-2 bg-red-50 text-red-700 border border-red-200 rounded text-[11px] font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Jumlah permintaan melebihi total stok gudang!
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-semibold">Memo / Referensi PO</label>
                  <input 
                    type="text" 
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    placeholder="Referensi nomor dokumen outbound..."
                    className="w-full p-2 border border-slate-300 rounded text-xs outline-none focus:border-[#0055C4]"
                  />
                </div>

                {message && (
                  <div className={`p-2 rounded text-[11px] font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700 flex items-start gap-1'}`}>
                    {message.type === 'error' && <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    {message.text}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
              <button 
                onClick={handleSaveBook}
                disabled={!isTargetMet || isVolumeInvalid}
                className="w-full bg-[#059669] font-bold text-white py-2.5 rounded text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
                {editingManifestId ? 'Perbarui Alokasi Manifes' : 'Simpan Alokasi Pick Ke Manifes'}
              </button>

              {bookedTransactions.length > 0 && (
                <div className="pt-2 border-t border-dashed border-slate-200 mt-2">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[10px] font-black text-slate-600 uppercase">Antrean Manifest Pick:</h4>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded">{bookedTransactions.length} Items</span>
                  </div>
                  <button 
                    onClick={handleConfirmAllManifest}
                    className="w-full bg-[#0055C4] font-bold text-white py-2.5 rounded text-xs flex items-center justify-center gap-1.5 hover:bg-blue-800 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Confirm Pick & Cetak Nota
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* AI Recommendation & Custom Selection Panel */}
          <section className="col-span-12 lg:col-span-7 flex flex-col justify-start space-y-4">
            <div className="bg-[#0055C4] text-white rounded-lg p-5 shadow-md flex flex-col justify-center border-l-4 border-emerald-400">
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-[9px] font-black px-2 py-0.5 rounded tracking-widest uppercase text-white font-mono">
                  AI RECOMMENDATION ACTIVE
                </span>
              </div>
              <h3 className="text-base font-normal mt-2 leading-snug">
                Rekomendasi Utama Penempatan Slot:{' '}
                <span className="font-mono font-black text-emerald-300 underline decoration-2 decoration-emerald-400 tracking-wide block sm:inline mt-1 sm:mt-0">
                  {aiRecommendationSlots}
                </span>
              </h3>
              <p className="text-[11px] text-blue-100 mt-2 font-normal">
                Sistem otomatis memetakan rute FIFO ideal berdasarkan data stok terkini. Anda bebas menyesuaikan alokasi nyata di bawah ini.
              </p>
            </div>

            {/* FORM ALOKASI MANUAL (ADMIN CONTROL PANEL) */}
            {availableStock.length > 0 && !isVolumeInvalid && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm animate-fadeIn">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Penyesuaian Alokasi Slot Rak Gudang:
                  </h4>
                  <button
                    type="button"
                    onClick={() => setAllocations(aiRecommendedAllocations)}
                    className="text-[10px] bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#0055C4] hover:border-blue-200 border border-slate-200 px-2 py-1 rounded font-bold transition-all flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Reset ke Rekomendasi AI
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableStock.map((stock) => {
                    const currentAllocatedQty = allocations[stock.locatorId] || 0;
                    return (
                      <div key={stock.locatorId} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50/40 hover:bg-white transition-all">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">LOKASI SLOT</p>
                          <p className="text-xs font-mono font-black text-slate-800">SLOT {stock.locatorId}</p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Stok Tersedia: <span className="font-bold text-slate-700">{stock.available} PCS</span>
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-1.5">
                          <input 
                            type="number" 
                            min="0"
                            max={stock.available}
                            value={currentAllocatedQty || ''}
                            placeholder="0"
                            onChange={e => {
                              const inputVal = parseInt(e.target.value) || 0;
                              const safeVal = Math.min(stock.available, Math.max(0, inputVal));
                              setAllocations(prev => ({
                                ...prev,
                                [stock.locatorId]: safeVal
                              }));
                            }}
                            className="w-20 p-1.5 border border-slate-300 rounded text-xs font-mono font-black text-center text-red-600 outline-none focus:border-red-500 bg-white shadow-inner"
                          />
                          <span className="text-[10px] font-bold text-slate-400 font-mono">PCS</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* PREVIEW NOTA MANIFEST OUTBOUND */}
        {receiptPreview && (
          <div id="thermal-preview-section" className="bg-slate-100 rounded-lg p-6 border border-slate-300 flex flex-col items-center justify-center gap-4 transition-all animate-fadeIn">
            <div className="w-full flex justify-between items-center max-w-[400px]">
              <span className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Printer className="w-3.5 h-3.5 text-blue-600" /> Live Receipt Preview (Nota Keluar)
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-[#0055C4] hover:bg-blue-800 text-white text-[11px] px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors"
                >
                  Print Struk
                </button>
                <button 
                  onClick={() => setReceiptPreview(null)}
                  className="bg-slate-300 hover:bg-slate-400 text-slate-700 text-[11px] p-1 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            <div className="bg-white text-black p-5 font-mono text-[11px] leading-tight w-[100%] max-w-[400px] border border-slate-300 shadow-md uppercase">
              <div className="text-center">
                <p className="font-bold border-b border-dashed border-black pb-1">
                  DOKUMEN VALID Ref: {receiptPreview.manifestId}
                </p>
                <p className="font-bold tracking-wide pt-1 text-xs text-slate-950">
                  BARANG KELUAR (OUTBOUND)
                </p>
              </div>

              <div className="border-b border-dashed border-black my-2"></div>

              <div className="space-y-1 text-left text-[10px]">
                <p><span className="font-bold">WAKTU VALIDASI SUKSES:</span> <span className="font-sans normal-case">{receiptPreview.date}</span></p>
                <p><span className="font-bold">OPERATOR GUDANG:</span> {receiptPreview.operator}</p>
                <p><span className="font-bold">MEMO / REFERENSI:</span> <span className="normal-case">{receiptPreview.memo}</span></p>
              </div>

              <div className="border-b border-dashed border-black my-2"></div>

              <p className="font-bold text-left text-[10px] mb-1.5">
                DAFTAR HASIL DISTRIBUSI MULTI-RAK (PICKING ALOKASI):
              </p>

              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-black align-bottom">
                    <th className="py-1 font-bold w-[30%]">ITEM SKU</th>
                    <th className="py-1 font-bold w-[35%]">NAMA PRODUK</th>
                    <th className="py-1 font-bold text-center w-[15%]">KUANTITAS KELUAR</th>
                    <th className="py-1 font-bold text-right w-[20%]">TARGET SLOT RAK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-300">
                  {receiptPreview.rows.map((item, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="py-1.5 font-bold break-all pr-1">{item.sku}</td>
                      <td className="py-1.5 truncate max-w-[90px] pr-1 normal-case">{item.name}</td>
                      <td className="py-1.5 text-center font-black text-slate-950">{item.qty} PCS</td>
                      <td className="py-1.5 text-right font-bold text-blue-600">{item.locatorId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-b border-dashed border-black my-3"></div>

              <div className="grid grid-cols-2 text-center text-[10px] mt-4 pt-1 gap-4">
                <div className="flex flex-col justify-between h-14">
                  <p className="font-bold">PETUGAS GUDANG</p>
                  <div className="border-t border-black w-full pt-1 truncate">{receiptPreview.operator}</div>
                </div>
                <div className="flex flex-col justify-between h-14">
                  <p className="font-bold">ADMIN GUDANG</p>
                  <div className="border-t border-black w-full pt-1">ADMIN</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ANTREAN PENDING MANIFEST */}
        {groupedPendingTransactions.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-[#0055C4] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0055C4]"></span>
                Riwayat Antrean Pending Manifest Outbound
              </h3>
            </div>
            
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="p-2.5">Waktu Booking</th>
                    <th className="p-2.5">Item SKU</th>
                    <th className="p-2.5">Alokasi Pecahan Slot</th>
                    <th className="p-2.5 text-center">Total Pick Qty</th>
                    <th className="p-2.5">Operator</th>
                    <th className="p-2.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {groupedPendingTransactions.map((group) => (
                    <tr key={group.manifestId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-2.5 whitespace-nowrap font-sans text-slate-500">
                        {new Date(group.timestamp).toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-blue-700">{group.sku}</td>
                      <td className="p-2.5 font-mono text-slate-600">
                        <div className="flex flex-wrap gap-1">
                          {group.items.map((item, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 font-bold">
                              {item.locatorId} ({Math.abs(item.qty)})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-bold text-blue-700">{group.totalQty} PCS</td>
                      <td className="p-2.5 text-slate-600 uppercase text-[11px]">{group.operator}</td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleReviewPendingGroup(group)}
                          className="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-[#0055C4] px-2.5 py-1 rounded text-[11px] font-semibold border border-blue-200 transition-colors mr-2"
                        >
                          Review Form
                        </button>
                        <button
                          onClick={() => handlePreviewHistorical(group)}
                          className="inline-flex items-center gap-1 bg-slate-800 text-white hover:bg-slate-900 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Struk
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* SEMUA RIWAYAT TRANSAKSI OUTBOUND */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#0F294D] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#0055C4]" />
                Semua Riwayat Transaksi Outbound
              </h3>
              <p className="text-[11px] text-slate-500">Log mutasi item terperinci terkelompok per Manifes ID seperti di modul Inbound.</p>
            </div>
            <button 
              onClick={refreshTransactionsData}
              className="p-1 text-slate-400 hover:text-[#0055C4] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-2.5">Waktu Transaksi</th>
                  <th className="p-2.5">Manifest ID</th>
                  <th className="p-2.5">SKU Material</th>
                  <th className="p-2.5">Target Slot Rak</th>
                  <th className="p-2.5 text-center">Total Kuantitas</th>
                  <th className="p-2.5">Operator</th>
                  <th className="p-2.5">Memo / PO</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {aggregatedHistoryTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-slate-400 italic text-[11px]">Belum ada riwayat rekaman mutasi transaksi keluar.</td>
                  </tr>
                ) : (
                  aggregatedHistoryTransactions.map((group) => (
                    /* PERBAIKAN: Menggunakan group.id yang dijamin unik daripada group.manifestId */
                    <tr key={group.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(group.timestamp).toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 font-mono text-slate-400 text-[10px] font-bold">{group.manifestId}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{group.sku}</td>
                      <td className="p-2.5 font-mono font-bold text-[#0055C4]">
                        {group.locatorsList.sort().join(', ')}
                      </td>
                      <td className="p-2.5 text-center font-bold text-red-600">{group.totalQty} PCS</td>
                      <td className="p-2.5 text-slate-600 uppercase text-[10px]">{group.operator}</td>
                      <td className="p-2.5 text-slate-500 truncate max-w-[120px]">{group.memo}</td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                          group.status === 'CONFIRMED' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : group.status === 'BOOKED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {group.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handlePreviewHistorical(group)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] px-2 py-1 rounded font-bold transition-colors"
                        >
                          Lihat Struk
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* AREA PRINT NOTA STRUK */}
      {receiptPreview && (
        <div className="hidden print:block bg-white text-black p-0 font-mono text-[11px] leading-tight w-[76mm] mx-auto uppercase tracking-tight">
          <div className="text-center">
            <p className="font-bold border-b border-dashed border-black pb-1">
              DOKUMEN VALID Ref: {receiptPreview.manifestId}
            </p>
            <p className="font-bold tracking-wide pt-1 text-xs">BARANG KELUAR (OUTBOUND)</p>
          </div>
          <div className="border-b border-dashed border-black my-2"></div>
          <div className="space-y-1 text-left text-[10px]">
            <p><span className="font-bold">WAKTU VALIDASI SUKSES:</span> <span className="font-sans normal-case">{receiptPreview.date}</span></p>
            <p><span className="font-bold">OPERATOR GUDANG:</span> {receiptPreview.operator}</p>
            <p><span className="font-bold">MEMO / REFERENSI:</span> <span className="normal-case">{receiptPreview.memo}</span></p>
          </div>
          <div className="border-b border-dashed border-black my-2"></div>
          <p className="font-bold text-left text-[10px] mb-1.5">DAFTAR HASIL DISTRIBUSI MULTI-RAK (PICKING ALOKASI):</p>
          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-black align-bottom">
                <th className="py-1 font-bold w-[30%]">ITEM SKU</th>
                <th className="py-1 font-bold w-[35%]">NAMA PRODUK</th>
                <th className="py-1 font-bold text-center w-[15%]">QTY</th>
                <th className="py-1 font-bold text-right w-[20%]">SLOT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-gray-400">
              {receiptPreview.rows.map((item, idx) => (
                <tr key={idx} className="align-top">
                  <td className="py-1.5 font-bold break-all pr-1">{item.sku}</td>
                  <td className="py-1.5 truncate max-w-[80px] pr-1 normal-case">{item.name}</td>
                  <td className="py-1.5 text-center font-bold">{item.qty}</td>
                  <td className="py-1.5 text-right font-bold break-all">{item.locatorId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-b border-dashed border-black my-3"></div>
          <div className="grid grid-cols-2 text-center text-[10px] mt-4 pt-1 gap-4 page-break-inside-avoid">
            <div className="flex flex-col justify-between h-14">
              <p className="font-bold">PETUGAS GUDANG</p>
              <div className="border-t border-black w-full pt-1 truncate">{receiptPreview.operator}</div>
            </div>
            <div className="flex flex-col justify-between h-14">
              <p className="font-bold">ADMIN GUDANG</p>
              <div className="border-t border-black w-full pt-1">ADMIN</div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible !important; }
          .print\\:block { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}} />

    </div>
  );
}