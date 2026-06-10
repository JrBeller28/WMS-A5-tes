import React, { useEffect, useState } from 'react';
import { Plus, Upload, Download, Edit2, Trash2, X, Save, AlertCircle, ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Product, ZoneCategory } from '../types';
import { getProducts, addProduct, updateProduct, deleteProduct as deleteProductFromDb, addProductsBatch, getTransactions, getInventoryDetails } from '../lib/db';

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryDetails, setInventoryDetails] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

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

  const handleSave = async () => {
    if (!formData.sku || !formData.name || !formData.category || !formData.volumeM3 || !formData.uom) {
      setMessage({ type: 'error', text: 'All fields are required.' });
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.sku, formData);
      } else {
        const ext = products.find(p => p.sku === formData.sku);
        if (ext) {
           setMessage({ type: 'error', text: 'SKU already exists' });
           return;
        }
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
    setEditingProduct(product);
    setFormData(product);
    setShowForm(true);
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,sku,name,category,volumeM3,uom\nEXAMPLE-01,Example Product,FG_PLUMBING,0.5,PCS\nEXAMPLE-02,Another Example,FG_SMART_WATER,0.2,BOX";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "product_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n');
      const productsToImport: Partial<Product>[] = [];

      // Skip header (i=0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [sku, name, category, volumeM3, uom] = line.split(',');
        if (sku && name && category && volumeM3) {
          productsToImport.push({
            sku: sku.trim(),
            name: name.trim(),
            category: category.trim() as ZoneCategory,
            volumeM3: parseFloat(volumeM3.trim()),
            uom: uom ? uom.trim() : 'PCS'
          });
        }
      }

      if (productsToImport.length > 0) {
        try {
          // Check existing to skip
          const existSkus = new Set(products.map(p => p.sku));
          const newProducts = productsToImport.filter(p => p.sku && !existSkus.has(p.sku)) as Product[];
          
          if (newProducts.length > 0) {
              await addProductsBatch(newProducts);
          }
          
          setMessage({ type: 'success', text: `Import successful: ${newProducts.length} added, ${productsToImport.length - newProducts.length} skipped.` });
          fetchProducts();
        } catch (err) {
          setMessage({ type: 'error', text: 'Error importing products.' });
        }
      } else {
        setMessage({ type: 'error', text: 'No valid products found in CSV.' });
      }
      
      // reset file input
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
            setEditingProduct(null);
            setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: '' as any, uom: 'PCS' });
            setShowForm(!showForm);
            setMessage(null);
          }}
        >
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2 tracking-wide uppercase">
              <span className="w-5 h-5 rounded-full border-2 border-blue-600 text-blue-600 flex items-center justify-center text-lg">+</span>
              Katalog SKU & Kontrol Safety Stock Pabrik
            </h2>
            <p className="text-slate-500 mt-1.5 text-[13px]">
              Daftar SKU Aktif, berat per unit, dan status safety stock minimum. Klik untuk membuka/menutup panel registrasi baru.
            </p>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showForm ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <AlertCircle className="w-5 h-5"/>
          {message.text}
          <button className="ml-auto" onClick={() => setMessage(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Slide-out Form Panel (simplified as inline card) */}
      {showForm && (
        <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-md mb-6">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
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
                min="0.01"
                value={formData.volumeM3 || ''} 
                onChange={e => setFormData({...formData, volumeM3: parseFloat(e.target.value) || '' as any})}
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
              onClick={() => setShowForm(false)}
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
             <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
           ))}
         </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KODE SKU</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DESKRIPSI NAMA</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KATEGORI LAYOUT SLOT</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">POSISI RAK (SLOT)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DIMENSI (VOL/BERAT)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">AMBANG SAFETY STOCK</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">JUMLAH ON HAND</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">STATUS KEAMANAN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.filter(p => categoryFilter === '' || p.category === categoryFilter).map(p => {
              const safetyStock = (p.sku.charCodeAt(0) * 10 + p.sku.charCodeAt(p.sku.length - 1)) % 250 + 20;
              const invData = inventoryDetails[p.sku] || { totalPhysicalQty: 0, locators: {} };
              const onHandQty = invData.totalPhysicalQty;
              const isSafe = onHandQty >= safetyStock;
              const weightEstimate = (p.volumeM3 * 100).toFixed(1);
              
              const activeLocators = Object.entries(invData.locators)
                 .filter(([_locId, data]: [string, any]) => data.physicalQty > 0)
                 .map(([locId, data]: [string, any]) => `${locId} (${data.physicalQty})`);

              return (
                <tr key={p.sku} className="hover:bg-slate-50 transition-colors group relative">
                  <td className="px-6 py-4 text-sm font-bold text-blue-700 font-mono tracking-tight cursor-pointer" onClick={() => handleEditClick(p)}>{p.sku}</td>
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
                  <td className="px-6 py-4 text-sm font-medium text-slate-500 font-mono">{safetyStock} {p.uom}</td>
                  <td className={`px-6 py-4 text-sm font-bold font-mono ${isSafe ? 'text-emerald-600' : 'text-red-600'}`}>
                    {onHandQty} {p.uom}
                  </td>
                  <td className="px-6 py-4 relative">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                      isSafe ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
                    }`}>
                      {isSafe ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {isSafe ? 'Stok Aman' : 'Reorder Point'}
                    </span>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 pl-4 py-1">
                      <button 
                        onClick={() => handleDelete(p.sku)}
                        className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors shadow-sm bg-white border border-red-100"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-slate-500 font-medium">No products found. Add one or import CSV.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
