import React, { useEffect, useState } from 'react';
import { Plus, Upload, Download, Edit2, Trash2, X, Save, AlertCircle, ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Product, ZoneCategory } from '../types';
import { getProducts, addProduct, updateProduct, deleteProduct as deleteProductFromDb, addProductsBatch, getTransactions, getInventoryDetails } from '../lib/db';
import { getCurrentUser } from '../lib/auth'; // Mengambil fungsi auth

export function Inventory({ globalSearch = '' }: { globalSearch?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryDetails, setInventoryDetails] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  // Ambil data user aktif dan validasi hak akses khusus (Super Admin & Kepala Gudang JKT)
  const currentUser = getCurrentUser();
  const userRoleClean = currentUser?.role?.trim().toUpperCase() || '';
  
  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN' || currentUser?.role?.toLowerCase() === 'super admin';
  const isKepalaGudangJkt = userRoleClean === 'KEPALA_GUDANG_JKT' || userRoleClean === 'KEPALA GUDANG JKT';
  
  // Menggabungkan izin untuk melihat & mengeksekusi menu AKSI
  const hasActionAccess = isSuperAdmin || isKepalaGudangJkt;

  const fetchProducts = () => {
    Promise.all([
      getProducts(),
      getInventoryDetails()
    ]).then(([prods, inv]) => {
      setProducts(prods);
      setInventoryDetails(inv);
    }).catch(console.error);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Logika penyaringan gabungan (Filter Kategori Dropdown + Live Global Search Bar)
  const filteredProducts = products.filter(p => {
    const matchesCategory = categoryFilter === '' || p.category === categoryFilter;
    const matchesSearch = globalSearch === '' || 
      p.sku.toLowerCase().includes(globalSearch.toLowerCase()) ||
      p.name.toLowerCase().includes(globalSearch.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  // 1. HITUNG AGREGAT GRAND TOTAL UNTUK BALANCING KAPASITAS & STOK (Secara Dinamis)
  const totalMetrics = filteredProducts.reduce((acc, p) => {
    const invData = inventoryDetails[p.sku] || { totalPhysicalQty: 0 };
    const qty = invData.totalPhysicalQty || 0;
    
    acc.totalQty += qty;
    acc.totalVolume += (p.volumeM3 || 0) * qty;
    acc.totalWeight += ((p.volumeM3 || 0) * 100) * qty; // Estimasi berat total berdasarkan volume terpakai
    
    return acc;
  }, { totalQty: 0, totalVolume: 0, totalWeight: 0 });

  const handleSave = async () => {
    if (!formData.sku || !formData.name || !formData.category || formData.volumeM3 === undefined || formData.volumeM3 === '' || !formData.uom) {
      setMessage({ type: 'error', text: 'All fields are required.' });
      return;
    }

    try {
      if (editingProduct) {
        if (!hasActionAccess) {
          setMessage({ type: 'error', text: 'Akses ditolak. Hanya Super Admin atau Kepala Gudang JKT yang boleh mengubah data SKU.' });
          return;
        }
        await updateProduct(editingProduct.sku, formData);
      } else {
        await addProduct(formData as Product);
      }
      setMessage({ type: 'success', text: `Product ${editingProduct ? 'updated' : 'added'} successfully.` });
      setShowForm(false);
      setEditingProduct(null);
      setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
      fetchProducts();
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleDelete = async (sku: string) => {
    if (!hasActionAccess) {
      setMessage({ type: 'error', text: 'Akses ditolak. Hanya Super Admin atau Kepala Gudang JKT yang berhak menghapus data SKU.' });
      return;
    }

    if (!confirm(`Are you sure you want to delete SKU: ${sku}?`)) return;
    try {
      const txs = await getTransactions();
      const hasTransactions = txs.some(tx => tx.sku === sku);
      if (hasTransactions) {
        setMessage({ type: 'error', text: 'Cannot delete product with existing transactions' });
        return;
      }
      await deleteProductFromDb(sku);
      setMessage({ type: 'success', text: 'Product deleted successfully.' });
      fetchProducts();
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleEditClick = (product: Product) => {
    if (!hasActionAccess) return;
    setEditingProduct(product);
    setFormData(product);
    setShowForm(true);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,sku,name,category,volumeM3,uom\n" +
                       "P-PLUMB-001,Pipa PVC 2 Inch,FG_PLUMBING,0.015,PCS\n" +
                       "S-SMART-002,Water Flow Meter Digital,FG_SMART_WATER,0.008,BOX\n" +
                       "F-FIT-003,Sock Drat Dalam 1/2,FG_FITTING,0.002,PCS";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_import_sku.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isSuperAdmin) {
      setMessage({ type: 'error', text: 'Akses ditolak. Hanya Super Admin yang berhak mengimpor file CSV.' });
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n');
      const productsToImport: Partial<Product>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [sku, name, category, volumeM3, uom] = line.split(',');
        if (sku && name && category && volumeM3) {
          productsToImport.push({
            sku: sku.trim().toUpperCase(),
            name: name.trim(),
            category: category.trim() as ZoneCategory,
            volumeM3: parseFloat(volumeM3.trim()),
            uom: uom ? uom.trim().toUpperCase() : 'PCS'
          });
        }
      }

      if (productsToImport.length > 0) {
        try {
          const existSkus = new Set(products.map(p => p.sku));
          const newProducts = productsToImport.filter(p => p.sku && !existSkus.has(p.sku)) as Product[];
          
          if (newProducts.length > 0) {
              await addProductsBatch(newProducts);
          }
          
          setMessage({ 
            type: 'success', 
            text: `Berhasil mengimpor data: ${newProducts.length} SKU baru ditambahkan, ${productsToImport.length - newProducts.length} SKU dilewati karena duplikat.` 
          });
          fetchProducts();
        } catch (err) {
          setMessage({ type: 'error', text: 'Gagal mengimpor produk ke database.' });
        }
      } else {
        setMessage({ type: 'error', text: 'Tidak ada data produk valid yang ditemukan di dalam CSV.' });
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 relative">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
        <div 
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-200"
          onClick={() => {
            if (!showForm || editingProduct) {
              setEditingProduct(null);
              setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: '' as any, uom: 'PCS' });
              setShowForm(true);
            } else {
              setShowForm(false);
            }
            setMessage(null);
          }}
        >
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2 tracking-wide uppercase">
              <span className="w-5 h-5 rounded-full border-2 border-blue-600 text-blue-600 flex items-center justify-center text-lg">+</span>
              Katalog SKU & Kontrol Safety Stock Pabrik
            </h2>
            <p className="text-slate-500 mt-1.5 text-[13px]">
              Daftar SKU Aktif, dimensi unit, dan pengaturan manajemen stok gudang. Klik untuk membuka/menutup panel registrasi baru.
            </p>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showForm ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Aksi Massal (Bulk Management)</h4>
          <p className="text-xs text-slate-500 mt-0.5">Unggah data katalog gudang dalam jumlah banyak sekaligus menggunakan file spreadsheet (CSV).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors shadow-sm w-full sm:w-auto"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Unduh Template CSV
          </button>
          
          {isSuperAdmin ? (
            <label className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors shadow-sm cursor-pointer w-full sm:w-auto">
              <Upload className="w-4 h-4" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          ) : (
            <button
              type="button"
              disabled
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold rounded-lg opacity-60 cursor-not-allowed w-full sm:w-auto"
              title="Fitur import hanya tersedia untuk Super Admin"
            >
              <Upload className="w-4 h-4" />
              Import CSV (Terproteksi)
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <AlertCircle className="w-5 h-5"/>
          {message.text}
          <button className="ml-auto" onClick={() => setMessage(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-md mb-6 animate-fadeIn">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <button onClick={() => { setShowForm(false); setEditingProduct(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">SKU</label>
              <input 
                type="text" 
                value={formData.sku || ''} 
                onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                disabled={!!editingProduct}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono disabled:opacity-50"
                placeholder="e.g. ITEM-001"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Product Name</label>
              <input 
                type="text" 
                value={formData.name || ''} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500"
                placeholder="Product description"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Category / Zone</label>
              <select 
                value={formData.category || 'FG_PLUMBING'} 
                onChange={e => setFormData({...formData, category: e.target.value as ZoneCategory})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500"
              >
                <option value="FG_PLUMBING">Plumbing</option>
                <option value="FG_SMART_WATER">Smart Water</option>
                <option value="FG_FITTING">Fitting</option>
                <option value="FG_FILTER">Filter</option>
                <option value="PACKAGING_MATERIALS">Bahan Packing</option>
                <option value="ASSEMBLY_KIT">Manufacture / Assembly</option>
                <option value="SPECIFIC_AREA">Spesifik (R9)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Volume (m³ / Unit)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={formData.volumeM3 === undefined || formData.volumeM3 === null ? '' : formData.volumeM3} 
                onChange={e => setFormData({...formData, volumeM3: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">UOM</label>
              <input 
                type="text" 
                value={formData.uom || ''} 
                onChange={e => setFormData({...formData, uom: e.target.value.toUpperCase()})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="PCS"
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end gap-3">
            <button 
              onClick={() => { setShowForm(false); setEditingProduct(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white rounded-lg font-bold hover:bg-blue-800 shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save Product
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4 mt-6">
         <h3 className="font-bold text-slate-800">Filter Overview</h3>
         <select 
           value={categoryFilter} 
           onChange={e => setCategoryFilter(e.target.value)}
           className="p-2 border border-slate-300 rounded text-sm text-slate-800 bg-slate-50 outline-none w-64"
         >
           <option value="">Semua Kategori Layout</option>
           {Array.from(new Set(products.map(p => p.category))).map(cat => (
             <option key={cat as string} value={cat as string}>{(cat as string).replace('_', ' ')}</option>
           ))}
         </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KODE SKU</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DESKRIPSI NAMA</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KATEGORI LAYOUT SLOT</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">POSISI RAK (SLOT)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DIMENSI (VOL/BERAT)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">JUMLAH ON HAND</th>
              {hasActionAccess && (
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">AKSI</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map(p => {
              const invData = inventoryDetails[p.sku] || { totalPhysicalQty: 0, locators: {} };
              const onHandQty = invData.totalPhysicalQty;
              const weightEstimate = (p.volumeM3 * 100).toFixed(1);
              
              const activeLocators = Object.entries(invData.locators)
                 .filter(([_locId, data]: [string, any]) => data.physicalQty > 0)
                 .map(([locId, data]: [string, any]) => `${locId} (${data.physicalQty})`);

              return (
                <tr key={p.sku} className="hover:bg-slate-50 transition-colors group">
                  <td 
                    className={`px-6 py-4 text-sm font-bold text-blue-700 font-mono tracking-tight ${hasActionAccess ? 'cursor-pointer hover:underline' : 'cursor-default'}`} 
                    onClick={() => hasActionAccess && handleEditClick(p)}
                  >
                    {p.sku}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-800">{p.name}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">{p.category.replace('_', ' ')}</td>
                  <td className="px-6 py-4">
                     {activeLocators.length > 0 ? (
                       <div className="flex flex-wrap gap-1">
                         {activeLocators.map(loc => (
                           <span key={loc} className="px-2.5 py-0.5 text-[10px] font-bold font-mono bg-sky-50 text-sky-700 border border-sky-200 rounded-sm">
                             {loc}
                           </span>
                         ))}
                       </div>
                     ) : (
                       <span className="text-xs text-slate-400 font-medium italic">Tidak ada stok fisik</span>
                     )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-700 font-mono">{p.volumeM3} m³</div>
                    <div className="text-xs text-slate-400 mt-0.5">{weightEstimate} Kg</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold font-mono text-slate-700">
                    {onHandQty} {p.uom}
                  </td>
                  
                  {hasActionAccess && (
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleEditClick(p)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors shadow-sm bg-white border border-blue-200"
                          title="Edit Product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(p.sku)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors shadow-sm bg-white border border-red-200"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={hasActionAccess ? 7 : 6} className="p-12 text-center text-slate-500 font-medium">
                  Tidak ada produk yang cocok dengan pencarian atau filter kategori.
                </td>
              </tr>
            )}
          </tbody>

          {/* 2. BARIS GRAND TOTAL BARU UNTUK INVENTORY BALANCING KAPASITAS */}
          {filteredProducts.length > 0 && (
            <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-slate-800 font-bold sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
              <tr>
                <td colSpan={4} className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider text-right">
                  Grand Total ({filteredProducts.length} SKU Terfilter) :
                </td>
                {/* Akumulasi Total Dimensi Terpakai (Volume & Berat Kumulatif dari Stok On-Hand) */}
                <td className="px-6 py-4">
                  <div className="text-sm font-extrabold text-slate-700 font-mono">
                    {totalMetrics.totalVolume.toFixed(3)} m³
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {totalMetrics.totalWeight.toFixed(1)} Kg
                  </div>
                </td>
                {/* Total Kuantitas Fisik On Hand Kumulatif */}
                <td className="px-6 py-4 text-sm font-extrabold font-mono text-blue-700 whitespace-nowrap">
                  {totalMetrics.totalQty.toLocaleString('id-ID')} Items
                </td>
                {/* Kolom Aksi Kosong jika akses tersedia */}
                {hasActionAccess && <td className="px-6 py-4"></td>}
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
}