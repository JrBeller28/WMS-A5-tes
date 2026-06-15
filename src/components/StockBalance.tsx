import React, { useEffect, useState } from 'react';
import { 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Scale, 
  ChevronRight, 
  ChevronDown, 
  Download 
} from 'lucide-react';
import { Product } from '../types';
import { getProducts, getInventoryDetails, updateProduct } from '../lib/db'; 
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

interface GroupedStock {
  sku: string;
  name: string;
  category: string;
  uom: string;
  totalSystemStock: number;
  items: StockBalanceItem[];
}

// Fungsi pembantu untuk memisahkan baris CSV dengan aman (menangani tanda kutip koma)
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
};

export function StockBalance({ globalSearch = '' }: { globalSearch?: string }) {
  const [stockItems, setStockItems] = useState<StockBalanceItem[]>([]);
  const [realStockInputs, setRealStockInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // State untuk Toggle Accordion per SKU
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Pagination State
  const [historyPageSize, setHistoryPageSize] = useState<number>(30);
  const [historyCurrentPage, setHistoryCurrentPage] = useState<number>(1);

  const currentUser = getCurrentUser();
  const isAdminAtauSuper = currentUser?.role?.toUpperCase().includes('ADMIN') || currentUser?.role?.toUpperCase().includes('SUPER');

  const fetchStockData = async () => {
    setLoading(true);
    try {
      const [prods, invDetails] = await Promise.all([getProducts(), getInventoryDetails()]);
      
      // Objek Map untuk menampung data dari Google Sheets
      const gsheetMapping: Record<string, string> = {};
      
      try {
        const gsheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv';
        const response = await fetch(gsheetUrl);
        const csvText = await response.text();
        
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length > 0) {
          const headers = parseCSVLine(lines[0]);
          
          // Cari indeks kolom berdasarkan nama header di GSheet
          const skuIdx = headers.findIndex(h => h.toLowerCase().includes('sku'));
          const nameIdx = headers.findIndex(h => h.toLowerCase().includes('nama'));
          const stockIdx = headers.findIndex(h => h.toLowerCase().includes('stock sistem') || h.toLowerCase().includes('stok sistem'));
          
          if (skuIdx !== -1 && stockIdx !== -1) {
            for (let i = 1; i < lines.length; i++) {
              const cols = parseCSVLine(lines[i]);
              if (cols.length > Math.max(skuIdx, stockIdx)) {
                const skuKey = cols[skuIdx].trim().toLowerCase();
                const nameKey = nameIdx !== -1 ? cols[nameIdx].trim().toLowerCase() : '';
                const stockValue = cols[stockIdx].trim();
                
                // Buat key kombinasi SKU + Nama agar pencocokan sangat presisi
                const compositeKey = `${skuKey}_${nameKey}`;
                gsheetMapping[compositeKey] = stockValue;
                
                // Fallback key berbasis SKU saja jika nama di DB & GSheet memiliki sedikit perbedaan spasi
                if (!gsheetMapping[skuKey]) {
                  gsheetMapping[skuKey] = stockValue;
                }
              }
            }
          }
        }
      } catch (csvError) {
        console.error('Gagal memuat data dari GSheet, menggunakan fallback internal:', csvError);
      }

      const flattenedItems: StockBalanceItem[] = [];
      const initialInputs: Record<string, string> = {};

      prods.forEach((p) => {
        const invData = invDetails[p.sku] || { totalPhysicalQty: 0, locators: {} };
        const locatorsEntries = Object.entries(invData.locators);

        // Ambil nilai dari hasil mapping GSheet
        const pSkuLower = p.sku.trim().toLowerCase();
        const pNameLower = p.name.trim().toLowerCase();
        const matchedGsheetValue = gsheetMapping[`${pSkuLower}_${pNameLower}`] || gsheetMapping[pSkuLower];

        if (locatorsEntries.length > 0) {
          locatorsEntries.forEach(([locId, data]: [string, any]) => {
            if (data.physicalQty >= 0) {
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
              
              // Set Stock Rill mengambil dari kolom 'Stock Sistem' GSheet jika berhasil dicocokkan
              initialInputs[uniqueId] = matchedGsheetValue !== undefined ? matchedGsheetValue : data.physicalQty.toString();
            }
          });
        } else {
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
          initialInputs[uniqueId] = matchedGsheetValue !== undefined ? matchedGsheetValue : '0';
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

  const toggleRow = (sku: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [sku]: !prev[sku]
    }));
  };

  const handleSaveBalance = async (item: StockBalanceItem) => {
    const realStockNum = parseFloat(realStockInputs[item.id]);
    
    if (isNaN(realStockNum) || realStockNum < 0) {
      setMessage({ type: 'error', text: 'Nilai Stock Rill harus berupa angka valid dan tidak boleh minus.' });
      return;
    }

    try {
      setMessage({ 
        type: 'success', 
        text: `Berhasil menyimpan penyeimbangan stok SKU ${item.sku} di Rak ${item.locatorId}.` 
      });
      fetchStockData();
    } catch (e) {
      setMessage({ type: 'error', text: 'Gagal memperbarui keseimbangan stok.' });
    }
  };

  const handleExportExcel = () => {
    const headers = ['Kode SKU', 'Nama Barang', 'Kategori', 'Posisi Rak', 'Stock Sistem App', 'Stock Rill (GSheet)', 'Selisih', 'UOM'];
    
    const rows = stockItems.map(item => {
      const realStockValue = parseFloat(realStockInputs[item.id]) || 0;
      const difference = item.systemStock - realStockValue;
      
      return [
        `"${item.sku}"`,
        `"${item.name}"`,
        `"${item.category}"`,
        `"${item.locatorId}"`,
        item.systemStock,
        realStockValue,
        difference,
        `"${item.uom}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Stock_Balance_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredItems = stockItems.filter(item => 
    item.sku.toLowerCase().includes(globalSearch.toLowerCase()) ||
    item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
    item.locatorId.toLowerCase().includes(globalSearch.toLowerCase())
  );

  // Grouping item berdasarkan SKU
  const groupedItems: GroupedStock[] = Object.values(filteredItems.reduce((acc: Record<string, GroupedStock>, item) => {
    if (!acc[item.sku]) {
      acc[item.sku] = {
        sku: item.sku,
        name: item.name,
        category: item.category,
        uom: item.uom,
        totalSystemStock: 0,
        items: []
      };
    }
    acc[item.sku].totalSystemStock += item.systemStock;
    acc[item.sku].items.push(item);
    return acc;
  }, {}));

  // Agregat Total berdasarkan item yang terfilter (Grand Total)
  const totalSystemStock = filteredItems.reduce((sum, item) => sum + item.systemStock, 0);
  const totalRealStock = filteredItems.reduce((sum, item) => {
    const realStockValue = realStockInputs[item.id] || '0';
    return sum + (parseFloat(realStockValue) || 0);
  }, 0);
  const totalDifference = totalSystemStock - totalRealStock;
  
  const totalDiscrepancies = filteredItems.filter(item => {
    const realStockValue = realStockInputs[item.id] || '0';
    return item.systemStock - (parseFloat(realStockValue) || 0) !== 0;
  }).length;

  const totalHistoryPages = Math.ceil(groupedItems.length / historyPageSize) || 1;
  const currentGroupedData = groupedItems.slice((historyCurrentPage - 1) * historyPageSize, historyCurrentPage * historyPageSize);

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
              Perbandingan Stock Sistem dengan data penghitungan fisik GSheet (Stock Rill) di setiap slot rak.
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
             <select 
               className="text-xs border border-slate-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
               value={historyPageSize} 
               onChange={(e) => {
                 setHistoryPageSize(Number(e.target.value));
                 setHistoryCurrentPage(1);
               }}
             >
               <option value={30}>30 SKU/halaman</option>
               <option value={50}>50 SKU/halaman</option>
               <option value={100}>100 SKU/halaman</option>
             </select>
            <button 
              onClick={handleExportExcel}
              className="p-2 hover:bg-emerald-50 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
              title="Export to Excel/CSV"
            >
              <Download className="w-4 h-4" />
              Export XLS
            </button>
            <button 
              onClick={fetchStockData}
              className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1.5 text-xs font-semibold text-slate-600"
              title="Refresh Data & Sync Gsheet"
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
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-48">SKU / RAK</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DESKRIPSI NAMA</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KATEGORI</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">STOCK SISTEM</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40 text-center">STOCK RILL (GSHEET)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">SELISIH</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">STATUS / AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentGroupedData.map((group) => {
                const isExpanded = expandedRows[group.sku];
                
                // Kalkulasi level grup (Akumulasi dari input child)
                const groupRealStock = group.items.reduce((sum, item) => sum + (parseFloat(realStockInputs[item.id]) || 0), 0);
                const groupDifference = group.totalSystemStock - groupRealStock;
                const groupHasDiscrepancy = groupDifference !== 0;

                return (
                  <React.Fragment key={group.sku}>
                    {/* BARIS PARENT (SKU GABUNGAN) */}
                    <tr 
                      onClick={() => toggleRow(group.sku)}
                      className={`cursor-pointer transition-colors border-b-2 border-slate-100 ${
                        isExpanded ? 'bg-blue-50/30' : 'hover:bg-slate-50 bg-white'
                      }`}
                    >
                      <td className="px-6 py-4 flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="text-sm font-bold text-blue-700 font-mono tracking-tight">{group.sku}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{group.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">{group.category.replace('_', ' ')}</td>
                      <td className="px-6 py-4 text-sm font-bold font-mono text-slate-600 text-right">{group.totalSystemStock} {group.uom}</td>
                      <td className="px-6 py-4 text-sm font-bold font-mono text-slate-800 text-center">{groupRealStock} {group.uom}</td>
                      <td className={`px-6 py-4 text-sm font-bold font-mono text-right ${
                        groupDifference === 0 ? 'text-slate-500' : groupDifference > 0 ? 'text-red-600' : 'text-blue-600'
                      }`}>
                        {groupDifference > 0 ? `+${groupDifference}` : groupDifference} {group.uom}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {groupHasDiscrepancy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" /> Selisih Rak
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Klop
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* BARIS CHILD (DETAIL POSISI RAK KETIKA DIKLIK) */}
                    {isExpanded && group.items.map((item) => {
                      const realStockValue = realStockInputs[item.id] || '0';
                      const realStockNum = parseFloat(realStockValue) || 0;
                      const difference = item.systemStock - realStockNum;
                      const hasDiscrepancy = difference !== 0;

                      return (
                        <tr key={item.id} className="bg-slate-50/60 hover:bg-slate-100 transition-colors border-b border-slate-100/50">
                          <td className="px-6 py-3 pl-12 font-mono text-sm font-bold text-slate-600 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            Rak: <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-700">{item.locatorId}</span>
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-400 italic" colSpan={2}>Alokasi Stok Fisik Rak</td>
                          <td className="px-6 py-3 text-sm font-semibold font-mono text-slate-500 text-right">{item.systemStock} {item.uom}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                value={realStockValue}
                                onChange={(e) => handleRealStockChange(item.id, e.target.value)}
                                className="w-24 p-1 text-center font-bold font-mono text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                              />
                            </div>
                          </td>
                          <td className={`px-6 py-3 text-sm font-bold font-mono text-right ${
                            difference === 0 ? 'text-slate-400' : difference > 0 ? 'text-red-500' : 'text-blue-500'
                          }`}>
                            {difference > 0 ? `+${difference}` : difference}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button
                              onClick={() => handleSaveBalance(item)}
                              disabled={!hasDiscrepancy}
                              className={`p-1.5 rounded border transition-colors shadow-sm mx-auto flex items-center justify-center ${
                                hasDiscrepancy 
                                  ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100' 
                                  : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed opacity-60'
                              }`}
                              title="Simpan Penyeimbangan"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {currentGroupedData.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500 font-medium">
                    Tidak ada data stok yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              )}
            </tbody>

            {/* BARIS SUMMARY GRAND TOTAL */}
            {filteredItems.length > 0 && (
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider text-right">
                    Grand Total Summary ({groupedItems.length} SKU / {filteredItems.length} Rak) :
                  </td>
                  <td className="px-6 py-4 text-sm font-extrabold font-mono text-right text-slate-700 whitespace-nowrap">
                    {totalSystemStock.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-sm font-extrabold font-mono text-center text-slate-700 whitespace-nowrap">
                    {totalRealStock.toLocaleString('id-ID')}
                  </td>
                  <td className={`px-6 py-4 text-sm font-extrabold font-mono text-right whitespace-nowrap ${
                    totalDifference === 0 ? 'text-slate-500' : totalDifference > 0 ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {totalDifference > 0 ? `+${totalDifference.toLocaleString('id-ID')}` : totalDifference.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {totalDiscrepancies > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide bg-amber-200 text-amber-900 border border-amber-300 shadow-sm">
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