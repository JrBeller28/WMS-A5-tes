import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Map } from 'lucide-react';
import { Locator, Product, ZoneCategory } from '../types';
import { getLocators, getProducts, getInventoryDetails } from '../lib/db';

interface LocatorStat {
  usedVol: number;
  maxVol: number;
  percentage: number;
  items: { sku: string; name: string; qty: number }[];
}

const ZONE_COLORS: Record<ZoneCategory | string, { text: string; bg: string; border: string; label: string }> = {
  'FG_PLUMBING': { text: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Plumbing' },
  'FG_SMART_WATER': { text: 'text-blue-400', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Smart Water' },
  'FG_FITTING': { text: 'text-indigo-400', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Fitting' },
  'FG_FILTER': { text: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Filter' },
  'PACKAGING_MATERIALS': { text: 'text-orange-400', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Bahan Packing' },
  'ASSEMBLY_KIT': { text: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200', label: 'Manufacture' },
  'SPECIFIC_AREA': { text: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', label: 'R9 Spesifik' },
  'DEFAULT': { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Unknown' },
};

const RACK_LAYOUT = [
  { id: 'R1', label: 'Rack R1 (A1 - A10)', zone: 'FG_PLUMBING' },
  { id: 'R2', label: 'Rack R2 (B1 - B9)', zone: 'FG_SMART_WATER' },
  { id: 'R3', label: 'Rack R3 (C1 - D9)', zone: 'FG_FITTING' },
  { id: 'R4', label: 'Rack R4 (E1 - E9)', zone: 'FG_FITTING' },
  { id: 'R5', label: 'Rack R5 (F1 - F9)', zone: 'FG_FILTER' },
  { id: 'R6', label: 'Rack R6 (G1 - G9)', zone: 'FG_FILTER' },
  { id: 'ABP', label: 'Area Bahan Packing', zone: 'PACKAGING_MATERIALS', static: true },
  { id: 'R7', label: 'Rack R7 (H1 - H9)', zone: 'ASSEMBLY_KIT' },
  { id: 'R8', label: 'Rack R8 (I1 - I9)', zone: 'ASSEMBLY_KIT' },
  { id: 'FL', label: 'Floating Buffer Area', zone: 'DEFAULT', static: true },
];

export function WarehouseVisualizer() {
  const [locators, setLocators] = useState<Locator[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<any>({});
  const [selectedRack, setSelectedRack] = useState<string>('R1');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getLocators(),
      getProducts(),
      getInventoryDetails()
    ]).then(([locData, prodData, invData]) => {
      setLocators(locData);
      setProducts(prodData);
      setInventory(invData);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(() => {
    const s: Record<string, LocatorStat> = {};
    locators.forEach(l => {
      s[l.id] = { usedVol: 0, maxVol: l.maxVolumeM3, percentage: 0, items: [] };
    });

    Object.entries(inventory).forEach(([sku, data]: [string, any]) => {
      const prod = products.find(p => p.sku === sku);
      const volPerUnit = prod ? prod.volumeM3 : 0;
      
      Object.entries(data.locators).forEach(([locId, locData]: [string, any]) => {
        const qty = locData.physicalQty;
        if (qty > 0 && s[locId]) {
          s[locId].usedVol += (qty * volPerUnit);
          s[locId].items.push({ sku, name: prod?.name || 'Unknown', qty });
        }
      });
    });

    // Calculate percentages
    Object.values(s).forEach(stat => {
      stat.percentage = Math.min(100, Math.round((stat.usedVol / stat.maxVol) * 100));
    });

    return s;
  }, [inventory, locators, products]);

  // Derive rack specific data for the Right Panel
  const rackLocators = locators.filter(l => l.rack === selectedRack);
  const rackZone = rackLocators.length > 0 ? rackLocators[0].zone : 'DEFAULT';
  const columns = Array.from(new Set(rackLocators.map(l => l.column))).sort();
  const levels = [4, 3, 2, 1]; // Top to bottom

  const totalRackVolume = rackLocators.reduce((sum, l) => sum + l.maxVolumeM3, 0);
  const usedRackVolume = rackLocators.reduce((sum, l) => sum + (stats[l.id]?.usedVol || 0), 0);

  const getUtilColor = (pct: number) => {
    if (pct >= 95) return 'bg-rose-500';
    if (pct >= 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  const getBorderUtilColor = (pct: number) => {
    if (pct >= 95) return 'border-rose-500';
    if (pct >= 70) return 'border-amber-400';
    if (pct > 0) return 'border-emerald-400';
    return 'border-slate-200';
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden font-sans shadow-sm">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-800 uppercase">
              Visualisasi Zonasi Layout & Raks (Gudang PSN)
            </h2>
            <p className="text-xs text-slate-500">Klik Rak pada denah lantai untuk membuka elevasi rak (Front View Grid) & detail slot locator.</p>
          </div>
        </div>
        
        {/* Legend Map */}
        <div className="hidden md:flex gap-2">
          {Object.entries(ZONE_COLORS).map(([key, val]) => {
            if (key === 'DEFAULT') return null;
            return (
              <span key={key} className={`px-2 py-1 ${val.bg} ${val.text} ${val.border} border rounded text-[10px] font-bold uppercase tracking-wider`}>
                {val.label}
              </span>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">Memuat data visualisasi...</div>
      ) : (
        <div className="flex flex-col xl:flex-row min-h-[600px]">
          
          {/* Left Panel - 2D Floor Plan */}
          <div className="w-full xl:w-80 bg-white border-r border-slate-200 p-5 shrink-0 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase">Denah Lantai Fisik Gudang (Floor Plan)</h3>
              <span className="px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded text-[10px] font-bold">2D MAP VIEW</span>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1">
              {RACK_LAYOUT.map(rack => {
                const colors = ZONE_COLORS[rack.zone] || ZONE_COLORS['DEFAULT'];
                const isActive = selectedRack === rack.id;
                return (
                  <button
                    key={rack.id}
                    onClick={() => !rack.static && setSelectedRack(rack.id)}
                    disabled={rack.static}
                    className={`flex flex-col items-start p-3 border rounded-lg transition-all text-left ${isActive ? 'ring-2 ring-indigo-500 shadow-sm ' + colors.border : 'border-slate-200 hover:border-slate-300'} ${rack.static ? 'bg-slate-50 opacity-70 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
                  >
                    <span className={`text-sm font-bold ${colors.text}`}>{rack.id}</span>
                    <span className="text-[10px] text-slate-500 mt-1 leading-tight">{rack.label}</span>
                  </button>
                );
              })}
              
              <div className="col-span-2 mt-2">
                <div className="w-full py-2 bg-slate-100 border border-slate-200 border-dashed rounded text-center text-[10px] font-bold text-slate-400 tracking-widest">
                  LANE / GANGWAY AKSES FORKLIFT (CLEARANCE ZONE)
                </div>
                <div className="flex justify-center gap-2 mt-2">
                  <span className="px-3 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded text-[10px] font-bold">IN/OUT GATE</span>
                  <span className="px-3 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded text-[10px] font-bold">DISPATCH BAY</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-emerald-400"></span> Beban Aman (0 - 70% Terpakai)
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-amber-400"></span> Beban Tinggi (70% - 95% Terpakai)
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span> Kritis / Maksimum (95% - 100% Terpakai)
              </div>
            </div>
          </div>

          {/* Right Panel - Rack Elevation */}
          <div className="flex-1 bg-white p-6 overflow-hidden flex flex-col">
            
            {/* Elevation Header */}
            <div className="flex justify-between items-start mb-8 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-mono font-bold text-slate-800 flex items-center gap-2">
                  <Map className="w-5 h-5 text-indigo-500" />
                  ELEVASI DEPAN (FRONT VIEW) RAK: RACK {selectedRack} 
                  <span className="text-slate-400 text-base">({columns[0]} - {columns[columns.length - 1]})</span>
                </h3>
                <p className="text-sm font-medium text-slate-600 mt-1">
                  Kategori Zona: <span className={`font-bold ${ZONE_COLORS[rackZone]?.text || ''}`}>{ZONE_COLORS[rackZone]?.label}</span>
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Volume</p>
                <p className="text-sm font-mono font-bold text-slate-800">
                  {usedRackVolume.toFixed(2)} m³ / {totalRackVolume.toFixed(1)} m³
                </p>
              </div>
            </div>

            {/* Grid Container */}
            <div className="flex-1 overflow-auto bg-slate-50/30 rounded-xl border border-slate-100 p-4">
              <div className="inline-flex flex-col gap-6 w-max min-w-full pb-4">
                
                {levels.map(level => (
                  <div key={level} className="flex relative">
                    {/* Level Label */}
                    <div className="w-16 shrink-0 flex items-center justify-end pr-4 text-xs font-bold text-slate-400">
                      Level {level}
                    </div>

                    {/* Columns */}
                    <div className="flex gap-4">
                      {columns.map(col => {
                        const locId = `${selectedRack}-${col}.${level}`;
                        const stat = stats[locId] || { usedVol: 0, maxVol: 5.4, percentage: 0, items: [] };
                        const isVacant = stat.percentage === 0;
                        const borderColor = getBorderUtilColor(stat.percentage);

                        return (
                          <div key={locId} className="w-48 flex flex-col items-center">
                            {/* Slot Card */}
                            <div className={`w-full bg-white border-2 ${borderColor} rounded-lg p-3 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] relative overflow-hidden transition-all hover:shadow-md`}>
                              
                              {/* Slot ID & % */}
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-slate-800 text-sm">{col}.{level}</span>
                                <span className={`text-[10px] font-mono font-bold ${stat.percentage >= 95 ? 'text-rose-600' : 'text-slate-400'}`}>
                                  {stat.percentage}%
                                </span>
                              </div>

                              {/* Content */}
                              <div className="h-12 flex flex-col justify-center">
                                {isVacant ? (
                                  <span className="text-xs italic font-semibold text-slate-300 text-center tracking-widest">VACANT</span>
                                ) : (
                                  <>
                                    <div className="text-[11px] font-bold text-slate-800 truncate" title={stat.items[0]?.name}>
                                      {stat.items[0]?.sku}
                                    </div>
                                    <div className="text-[10px] font-medium text-slate-500">
                                      {stat.items.map(i => i.qty).reduce((a,b)=>a+b,0)} PCS
                                      {stat.items.length > 1 && <span className="text-indigo-500 ml-1">+{stat.items.length - 1} Mix</span>}
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Progress bar */}
                              <div className="mt-3">
                                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full transition-all duration-500 ${getUtilColor(stat.percentage)}`} style={{ width: `${stat.percentage}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-[9px] font-mono font-medium text-slate-500">{stat.usedVol.toFixed(2)} m³</span>
                                  <span className="text-[9px] font-mono text-slate-400">{stat.maxVol.toFixed(1)} m³ Max</span>
                                </div>
                              </div>

                            </div>

                            {/* Beam representation directly under card */}
                            <div className="w-[90%] h-2 bg-slate-800 rounded-sm mt-3 relative">
                              {/* Small triangle to indicate connection */}
                              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-r-4 border-r-slate-800 border-b-4 border-b-transparent"></div>
                              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-l-4 border-l-slate-800 border-b-4 border-b-transparent"></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono font-medium text-slate-400 uppercase tracking-widest">
              <span>Rack Sill Beam (Tie Beam Protection Flange)</span>
              <span>MAX 5.4 m³ (Maksimal 2 Pallet @ 2.7 m³ per level)</span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
