import React, { useState, useEffect } from 'react';
import { Layers, Plus, Pencil, Trash2, X, Save, Search, RefreshCw, AlertTriangle, Printer, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { getLocators, addLocator, updateLocator, deleteLocator } from '../lib/db';
import { Locator, ZoneCategory } from '../types';

export const RackManagement = () => {
  const [locators, setLocators] = useState<Locator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printLocator, setPrintLocator] = useState<Locator | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [id, setId] = useState('');
  const [rack, setRack] = useState('');
  const [column, setColumn] = useState('');
  const [level, setLevel] = useState<number>(1);
  const [zone, setZone] = useState<ZoneCategory>('DEFAULT');
  const [maxVolume, setMaxVolume] = useState<number>(5.4);
  const [barcode, setBarcode] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchLocators = async () => {
    setLoading(true);
    try {
      const data = await getLocators();
      setLocators(data);
    } catch (err) {
      console.error("Gagal mengambil data rak:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocators();
  }, []);

  const openAddModal = () => {
    setEditingId(null);
    setId('');
    setRack('');
    setColumn('');
    setLevel(1);
    setZone('DEFAULT');
    setMaxVolume(5.4);
    setBarcode('');
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const openEditModal = (locator: Locator) => {
    setEditingId(locator.id);
    setId(locator.id);
    setRack(locator.rack);
    setColumn(locator.column);
    setLevel(locator.level);
    setZone(locator.zone);
    setMaxVolume(locator.maxVolumeM3);
    setBarcode(locator.barcode || '');
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus Rak (Locator) ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        await deleteLocator(id);
        setSuccess(`Rak ${id} berhasil dihapus.`);
        fetchLocators();
      } catch (err: any) {
        setError(`Gagal menghapus rak: ${err.message}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!id.trim() || !rack.trim() || !column.trim()) {
      setError('ID Locator, Nama Rak, dan Kolom wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const dataToSave: Locator = {
        id: id.trim(),
        rack: rack.trim(),
        column: column.trim(),
        level: level,
        zone: zone,
        maxVolumeM3: maxVolume,
        barcode: barcode.trim() || id.trim(),
      };

      if (editingId) {
        if (editingId !== dataToSave.id) {
          // If ID changed, we need to add new and delete old
          const existing = locators.find(l => l.id === dataToSave.id);
          if (existing) {
            throw new Error('ID Locator sudah digunakan. Silakan gunakan ID lain.');
          }
          await addLocator(dataToSave);
          await deleteLocator(editingId);
        } else {
          await updateLocator(editingId, dataToSave);
        }
        setSuccess(`Rak ${dataToSave.id} berhasil diperbarui.`);
      } else {
        const existing = locators.find(l => l.id === dataToSave.id);
        if (existing) {
          throw new Error('ID Locator sudah digunakan. Silakan gunakan ID lain.');
        }
        await addLocator(dataToSave);
        setSuccess(`Rak ${dataToSave.id} berhasil ditambahkan.`);
      }
      
      setIsModalOpen(false);
      fetchLocators();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredLocators = locators.filter(l => 
    l.id.toLowerCase().includes(search.toLowerCase()) || 
    l.rack.toLowerCase().includes(search.toLowerCase()) ||
    l.zone.toLowerCase().includes(search.toLowerCase())
  );

  const zones: ZoneCategory[] = [
    'DEFAULT',
    'FG_PLUMBING',
    'FG_SMART_WATER',
    'FG_FITTING',
    'FG_FILTER',
    'PACKAGING_MATERIALS',
    'ASSEMBLY_KIT',
    'SPECIFIC_AREA',
    'RAW_MATERIALS'
  ];

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" />
            Manajemen Rak (Developer)
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm">
            Kelola tata letak gudang, posisi rak (locator), dan kapasitas setiap slot penyimpanan.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={fetchLocators}
            className="p-2.5 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition-colors flex items-center justify-center text-slate-600"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Rak Baru
          </button>
        </div>
      </div>

      {success && !isModalOpen && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm font-bold flex items-center gap-2">
          {success}
        </div>
      )}
      
      {error && !isModalOpen && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Cari berdasarkan ID Locator, Rak, atau Zone..."
          />
        </div>
        <div className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          Total: {filteredLocators.length} Rak
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">ID LOCATOR</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">BARCODE</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">RAK</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">KOLOM / TINGKAT</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">KATEGORI ZONA</th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 tracking-wider">KAPASITAS (M³)</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-slate-500 tracking-wider">AKSI</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                      <span className="text-sm font-semibold text-slate-500">Memuat data rak...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLocators.length > 0 ? (
                filteredLocators.map((loc) => (
                  <tr key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded">
                        {loc.id}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                      {loc.barcode || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">
                      {loc.rack}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                      Kolom {loc.column} <span className="mx-2 text-slate-300">|</span> Tingkat {loc.level}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        {loc.zone.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700 text-right font-mono">
                      {loc.maxVolumeM3.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => {
                            setPrintLocator(loc);
                            setIsPrintModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                          title="Print Barcode"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openEditModal(loc)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit Rak"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(loc.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Hapus Rak"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium text-sm">
                    Tidak ada data rak yang ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                {editingId ? 'Edit Rak / Locator' : 'Tambah Rak Baru'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-bold border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">ID Locator *</label>
                  <input
                    type="text"
                    required
                    value={id}
                    onChange={e => setId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    placeholder="Contoh: FL-A1.1"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Harus unik. Gunakan format konsisten (Misal Rak-Kolom.Tingkat)</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Barcode (Opsional)</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    placeholder="Otomatis sama dengan ID Locator jika kosong"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Nama Rak *</label>
                    <input
                      type="text"
                      required
                      value={rack}
                      onChange={e => setRack(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                      placeholder="Contoh: FL-A"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Kolom *</label>
                    <input
                      type="text"
                      required
                      value={column}
                      onChange={e => setColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                      placeholder="Contoh: FL-A1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Tingkat / Level *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={level}
                      onChange={e => setLevel(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Maks Vol (M³) *</label>
                    <input
                      type="number"
                      required
                      step="0.1"
                      min="0.1"
                      value={maxVolume}
                      onChange={e => setMaxVolume(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Kategori Zona *</label>
                  <select
                    value={zone}
                    onChange={e => setZone(e.target.value as ZoneCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-slate-700"
                  >
                    {zones.map(z => (
                      <option key={z} value={z}>{z.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors shadow flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Rak'}
                  {!saving && <Save className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPrintModalOpen && printLocator && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 print:shadow-none print:border-none print:w-[300px]">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between print:hidden">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                Print Barcode Rack
              </h3>
              <button 
                onClick={() => {
                  setIsPrintModalOpen(false);
                  setPrintLocator(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Area Print Aktual */}
            <div className="p-8 pb-4 text-center bg-white print:p-4">
              <div className="border-4 border-slate-900 inline-block p-4 rounded-xl bg-white">
                <QRCode 
                  value={printLocator.barcode || printLocator.id} 
                  size={200}
                  level="H"
                />
              </div>
              <h4 className="mt-6 text-3xl font-black text-slate-900 tracking-wider font-mono uppercase">
                {printLocator.barcode || printLocator.id}
              </h4>
              <p className="text-sm font-bold text-slate-500 mt-2">
                ZONE: {printLocator.zone.replace('_', ' ')}
              </p>
            </div>
            
            <div className="p-6 pt-2 pb-6 print:hidden flex flex-col gap-3">
              <p className="text-xs text-center text-slate-500 mb-2">Tempelkan barcode ini pada rak fisik agar operator dapat memindainya melalui Rack Scanner.</p>
              <button
                onClick={() => window.print()}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors shadow flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Sekarang
              </button>
            </div>
          </div>
          
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body * { visibility: hidden; }
              .print\\:block, .print\\:block * { visibility: visible !important; }
              .fixed.inset-0.z-\\[60\\] { position: absolute; left: 0; top: 0; width: 100%; height: auto; background: white; }
              .fixed.inset-0.z-\\[60\\] > div { box-shadow: none; border: none; align-items: flex-start; justify-content: flex-start; }
              .fixed.inset-0.z-\\[60\\] * { visibility: visible; }
              .print\\:hidden { display: none !important; }
            }
          `}} />
        </div>
      )}
    </div>
  );
};
