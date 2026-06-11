import React, { useEffect, useState } from 'react';
import { Save, AlertCircle, CheckCircle2, AlertTriangle, Search, RefreshCw, Scale } from 'lucide-react';
import { Product } from '../types';
import { getProducts, getInventoryDetails, updateProduct } from '../lib/db'; // Sesuaikan jika ada fungsi update stock khusus
import { getCurrentUser } from '../lib/auth';

interface StockBalanceItem {
  id: string; // Kombinasi unik locatorId_sku
  locatorId: string;
  sku: string;
  name: string;
  category: string;
  systemStock: number;
  uom: string;
}

export function StockBalance({ globalSearch = '' }: { globalSearch?: string }) {
  const [stockItems, setStockItems] = useState<StockBalanceItem[]>([]);
  const [realStockInputs, setRealStockInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pagination State
  const [historyPageSize, setHistoryPageSize] = useState<number>(30);
  const [historyCurrentPage, setHistoryCurrentPage] = useState<number>(1);

  // Ambil data user aktif jika diperlukan pengecekan role
  const currentUser = getCurrentUser();
  const isAdminAtauSuper = currentUser?.role?.toUpperCase().includes('ADMIN') || currentUser?.role?.toUpperCase().includes('SUPER');

  const fetchStockData = async () => {
    setLoading(true);
    try {
      const [prods, invDetails] = await Promise.all([getProducts(), getInventoryDetails()]);
      
      const flattenedItems: StockBalanceItem[] = [];
      const initialInputs: Record<string, string> = {};

      prods.forEach((p) => {
        const invData = invDetails[p.sku] || { totalPhysicalQty: 0, locators: {} };
        const locatorsEntries = Object.entries(invData.locators);

        if (locatorsEntries.length > 0) {
          locatorsEntries.forEach(([locId, data]: [string, any]) => {
            if (data.physicalQty >= 0) { // Mengambil slot yang memiliki record stok
              const uniqueId = `${locId}_${p.sku}`;
              flattenedItems.push({
                id: uniqueId,
                locatorId: locId,
                sku: p.sku,
                name: p.name,
                category: p.category,
                systemStock: data.physicalQty,
                uom: p.uom || 'PCS',
              });
              
              // Default nilai Stock Rill disamakan dengan Stock Sistem di awal
              initialInputs[uniqueId] = data.physicalQty.toString();
            }
          });
        } else {
          // Jika SKU belum masuk ke rak manapun, tampilkan dengan posisi rak '-'
          const uniqueId = `-${p.sku}`;
          flattenedItems.push({
            id: uniqueId,
            locatorId: '-',
            sku: p.sku,
            name: p.name,
            category: p.category,
            systemStock: 0,
            uom: p.uom || 'PCS',
          });
          initialInputs[uniqueId] = '0';
        }
      });

      setStockItems(flattenedItems);
      setRealStockInputs(initialInputs);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Gagal memuat data stok dari sistem.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, []);

  const handleRealStockChange = (id: string, value: string) => {
    setRealStockInputs((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSaveBalance = async (item: StockBalanceItem) => {
    const realStockNum = parseFloat(realStockInputs[item.id]);
    
    if (isNaN(realStockNum) || realStockNum < 0) {
      setMessage({ type: 'error', text: 'Nilai Stock Rill harus berupa angka valid dan tidak boleh minus.' });
      return;
    }

    try {
      // Di sini Anda bisa menembakkan fungsi log opname atau update database sesungguhnya
      // Contoh: await saveStockOpname(item.sku, item.locatorId, item.systemStock, realStockNum);
      
      setMessage({ 
        type: 'success', 
        text: `Berhasil menyimpan penyeimbangan stok SKU ${item.sku} di Rak ${item.locatorId}.` 
      });
      
      // Refresh data setelah disimpan
      fetchStockData();
    } catch (e) {
      setMessage({ type: 'error', text: 'Gagal memperbarui keseimbangan stok.' });
    }
  };

  // Filter pencarian berdasarkan SKU, Nama, atau Posisi Rak
  const filteredItems = stockItems.filter(item => 
    item.sku.toLowerCase().includes(globalSearch.toLowerCase()) ||
    item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
    item.locatorId.toLowerCase().includes(globalSearch.toLowerCase())
  );

  // 1. HITUNG DATA AGREGAT GRAND TOTAL (Secara dinamis berdasarkan item terfilter)
  const totalSystemStock = filteredItems.reduce((sum, item) => sum + item.systemStock, 0);
  const totalRealStock = filteredItems.reduce((sum, item) => {
    const realStockValue = realStockInputs[item.id] || '0';
    return sum + (parseFloat(realStockValue) || 0);
  }, 0);
  const totalDifference = totalSystemStock - totalRealStock;
  
  // Hitung jumlah baris yang statusnya masih belum seimbang (Mempunyai Selisih)
  const totalDiscrepancies = filteredItems.filter(item => {
    const realStockValue = realStockInputs[item.id] || '0';
    return item.systemStock - (parseFloat(realStockValue) || 0) !== 0;
  }).length;

  const totalHistoryPages = Math.ceil(filteredItems.length / historyPageSize) || 1;
  const currentHistoryData = filteredItems.slice((historyCurrentPage - 1) * historyPageSize, historyCurrentPage * historyPageSize);

  return (
    <div className="space-y-6 relative text-slate-800">
      {/* HEADER BANNER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2 tracking-wide uppercase">
              <Scale className="w-5 h-5 text-blue-600" />
              Stock Balance & Keseimbangan Gudang
            </h2>
            <p className="text-slate-500 mt-1.5 text-[13px]">
              Perbandingan Stock Sistem ( spreadsheet / Gsheet ) dengan hasil penghitungan fisik ( Stock Rill ) di setiap slot rak.
            </p>
          </div>
          <div className="flex gap-2 items-center">
             <select 
               className="text-xs border border-slate-300 rounded p-2"
               value={historyPageSize} 
               onChange={(e) => {
                 setHistoryPageSize(Number(e.target.value));
                 setHistoryCurrentPage(1);
               }}
             >
               <option value={30}>30/halaman</option>
               <option value={50}>50/halaman</option>
               <option value={100}>100/halaman</option>
             </select>
            <button 
              onClick={fetchStockData}
              className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1 text-xs font-semibold text-slate-600"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sync Gsheet
            </button>
          </div>
        </div>
      </div>

      {/* NOTIFIKASI MESSAGE */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 text-sm font-bold border ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <AlertCircle className="w-5 h-5" />
          {message.text}
          <button className="ml-auto text-slate-400 hover:text-slate-600" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {/* DATA TABLE STOCK BALANCE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">POSISI RAK (SLOT)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KODE SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DESKRIPSI NAMA</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KATEGORI LAYOUT SLOT</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">STOCK SISTEM</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40 text-center">STOCK RILL (FISIK)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">SELISIH STOCK</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">STATUS / AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentHistoryData.map((item) => {
                const realStockValue = realStockInputs[item.id] || '0';
                const realStockNum = parseFloat(realStockValue) || 0;
                
                // Rumus: STOCK SISTEM dikurangi STOCK RILL
                const difference = item.systemStock - realStockNum;
                const hasDiscrepancy = difference !== 0;

                return (
                  <tr 
                    key={item.id} 
                    className={`transition-colors ${hasDiscrepancy ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'}`}
                  >
                    {/* 1. POSISI RAK */}
                    <td className="px-6 py-4 font-mono text-sm font-bold text-slate-700">
                      <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs">
                        {item.locatorId}
                      </span>
                    </td>

                    {/* 2. KODE SKU */}
                    <td className="px-6 py-4 text-sm font-bold text-blue-700 font-mono tracking-tight">
                      {item.sku}
                    </td>

                    {/* 3. DESKRIPSI NAMA */}
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">
                      {item.name}
                    </td>

                    {/* 4. KATEGORI LAYOUT SLOT */}
                    <td className="px-6 py-4 text-sm font-medium text-slate-500">
                      {item.category.replace('_', ' ')}
                    </td>

                    {/* 5. STOCK SISTEM */}
                    <td className="px-6 py-4 text-sm font-bold font-mono text-slate-600 text-right">
                      {item.systemStock} {item.uom}
                    </td>

                    {/* 6. STOCK RILL (Editable Input) */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={realStockValue}
                          onChange={(e) => handleRealStockChange(item.id, e.target.value)}
                          className="w-24 p-1.5 text-center font-bold font-mono text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        />
                        <span className="text-xs text-slate-400 font-bold font-mono">{item.uom}</span>
                      </div>
                    </td>

                    {/* 7. SELISIH STOCK */}
                    <td className={`px-6 py-4 text-sm font-bold font-mono text-right ${
                      difference === 0 ? 'text-slate-500' : difference > 0 ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {difference > 0 ? `+${difference}` : difference} {item.uom}
                    </td>

                    {/* STATUS / AKSI SIMPAN */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {hasDiscrepancy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" /> Selisih
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Klop
                          </span>
                        )}

                        {/* Tombol simpan perubahan individual */}
                        <button
                          onClick={() => handleSaveBalance(item)}
                          disabled={!hasDiscrepancy}
                          className={`p-1.5 rounded-md border transition-colors shadow-sm flex items-center justify-center ${
                            hasDiscrepancy 
                              ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100' 
                              : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed opacity-60'
                          }`}
                          title="Simpan Penyeimbangan"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {currentHistoryData.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500 font-medium">
                    Tidak ada data stok yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              )}
            </tbody>

            {/* 2. ELEMEN TFOOT UNTUK MENAMPILKAN BARIS GRAND TOTAL */}
            {filteredItems.length > 0 && (
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider text-right">
                    Grand Total Summary ({filteredItems.length} Baris) :
                  </td>
                  {/* Total Stock Sistem */}
                  <td className="px-6 py-4 text-sm font-extrabold font-mono text-right text-slate-700 whitespace-nowrap">
                    {totalSystemStock.toLocaleString('id-ID')}
                  </td>
                  {/* Total Stock Rill (Fisik) */}
                  <td className="px-6 py-4 text-sm font-extrabold font-mono text-center text-slate-700 whitespace-nowrap">
                    {totalRealStock.toLocaleString('id-ID')}
                  </td>
                  {/* Total Selisih Gabungan */}
                  <td className={`px-6 py-4 text-sm font-extrabold font-mono text-right whitespace-nowrap ${
                    totalDifference === 0 ? 'text-slate-500' : totalDifference > 0 ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {totalDifference > 0 ? `+${totalDifference.toLocaleString('id-ID')}` : totalDifference.toLocaleString('id-ID')}
                  </td>
                  {/* Status Ringkasan Deviasi Gudang */}
                  <td className="px-6 py-4 text-center">
                    {totalDiscrepancies > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide bg-amber-200 text-amber-900 border border-amber-300 shadow-sm animate-pulse">
                        <AlertTriangle className="w-3 h-3" /> {totalDiscrepancies} Rak Selisih
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide bg-emerald-200 text-emerald-900 border border-emerald-300 shadow-sm">
                        <CheckCircle2 className="w-3 h-3" /> Akurat (Klop)
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {totalHistoryPages > 1 && (
          <div className="flex justify-end items-center p-4 gap-2 text-xs border-t border-slate-200 bg-slate-50">
            <button 
              disabled={historyCurrentPage === 1}
              onClick={() => setHistoryCurrentPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="font-medium text-slate-600">Halaman {historyCurrentPage} dari {totalHistoryPages}</span>
            <button 
              disabled={historyCurrentPage === totalHistoryPages}
              onClick={() => setHistoryCurrentPage(p => Math.min(totalHistoryPages, p + 1))}
              className="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}