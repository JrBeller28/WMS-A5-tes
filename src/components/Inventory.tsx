import React, { useEffect, useState } from 'react';
import { Plus, Upload, Download, Edit2, Trash2, X, Save, AlertCircle } from 'lucide-react';
import { Product, ZoneCategory } from '../types';

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const fetchProducts = () => {
    fetch('/api/master/products')
      .then(r => r.json())
      .then(setProducts)
      .catch(console.error);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSave = async () => {
    if (!formData.sku || !formData.name || !formData.category || !formData.volumeM3) {
      setMessage({ type: 'error', text: 'All fields are required.' });
      return;
    }

    const url = editingProduct ? `/api/master/products/${editingProduct.sku}` : '/api/master/products';
    const method = editingProduct ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Product ${editingProduct ? 'updated' : 'added'} successfully.` });
        setShowForm(false);
        setEditingProduct(null);
        setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
        fetchProducts();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleDelete = async (sku: string) => {
    if (!confirm(`Are you sure you want to delete SKU: ${sku}?`)) return;
    try {
      const res = await fetch(`/api/master/products/${sku}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Product deleted successfully.' });
        fetchProducts();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
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
          const res = await fetch('/api/master/products/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: productsToImport })
          });
          const data = await res.json();
          if (res.ok) {
            setMessage({ type: 'success', text: `Import successful: ${data.added} added, ${data.skipped} skipped.` });
            fetchProducts();
          } else {
            setMessage({ type: 'error', text: data.error });
          }
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventory & Master Data</h2>
          <p className="text-slate-500 mt-1 text-sm">Manage SKU profiles, stock levels, and warehouse mapping.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-bold transition-colors"
          >
            <Download className="w-4 h-4" />
            Template CSV
          </button>
          
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-bold transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          
          <button 
            onClick={() => {
              setEditingProduct(null);
              setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: '' as any, uom: 'PCS' });
              setShowForm(true);
              setMessage(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-bold hover:bg-blue-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add SKU
          </button>
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
                value={formData.sku} 
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
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500"
                placeholder="Product description"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Category / Zone</label>
              <select 
                value={formData.category} 
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
                value={formData.volumeM3} 
                onChange={e => setFormData({...formData, volumeM3: parseFloat(e.target.value) || undefined})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">UOM</label>
              <input 
                type="text" 
                value={formData.uom} 
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">SKU ID</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Product Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Category Zone</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Unit Volume (m³)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">UOM</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map(p => (
              <tr key={p.sku} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4 text-sm font-bold text-slate-900 font-mono tracking-tight">{p.sku}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-800">{p.name}</td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 rounded bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                    {p.category.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-mono text-slate-600">{p.volumeM3}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-700">{p.uom}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleEditClick(p)}
                      className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(p.sku)}
                      className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-slate-500 font-medium">No products found. Add one or import CSV.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
