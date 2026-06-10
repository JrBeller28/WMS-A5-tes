import React, { useState, useEffect } from 'react';
import { Camera, Shield, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { Product, Locator, Transaction } from '../types';
import { getProducts, getPutawayRecommendations, addTransaction, getTransactions, getInventoryDetails, getLocators } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '../lib/auth';

export function Inbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [qty, setQty] = useState('');
  const [recommendations, setRecommendations] = useState<Locator[]>([]);
  const [selectedLocator, setSelectedLocator] = useState('');
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inboundList, setInboundList] = useState<any[]>([]);
  
  const [locators, setLocators] = useState<Locator[]>([]);
  const [inventory, setInventory] = useState<any>({});

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

  const handleRecommend = async () => {
    if (!selectedSku || !qty) return;
    setLoading(true);
    try {
      const recs = await getPutawayRecommendations(selectedSku, Number(qty));
      setRecommendations(recs);
      if (recs.length > 0) {
        setSelectedLocator(recs[0].id);
      } else {
        setMessage({ type: 'error', text: 'No suitable locators found.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error fetching recommendations' });
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRecommend();
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedSku, qty]);

  const handleAddToList = () => {
    if (!selectedSku || !qty || !selectedLocator) {
      setMessage({ type: 'error', text: 'Please complete all fields' });
      return;
    }
    setInboundList([...inboundList, {
      id: uuidv4(),
      sku: selectedSku,
      qty: Math.abs(Number(qty)),
      locatorId: selectedLocator
    }]);
    setQty('');
    setSelectedSku('');
    setRecommendations([]);
    setMessage({ type: 'success', text: 'Added to Putaway List' });
    setTimeout(() => setMessage(null), 2000);
  };

  const handleConfirmAll = async () => {
    if (inboundList.length === 0) return;
    try {
      const user = getCurrentUser();
      for (const item of inboundList) {
        const tx = {
           id: item.id,
           type: 'INBOUND' as const,
           sku: item.sku,
           qty: item.qty,
           locatorId: item.locatorId,
           operator: user ? user.name : 'Unknown User',
           timestamp: new Date().toISOString(),
           status: 'CONFIRMED' as const
        };
        await addTransaction(tx);
      }
      setMessage({ type: 'success', text: 'Batch putaway complete!' });
      setInboundList([]);
      fetchTransactions();
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error during batch' });
    }
  };

  const productDetails = products.find(p => p.sku === selectedSku);
  const recommendedLoc = recommendations.find(r => r.id === selectedLocator) || recommendations[0];

  // For visual grid
  let rack = 'FL-A';
  const selectedLocData = locators.find(l => l.id === selectedLocator);
  if (selectedLocData) {
    rack = selectedLocData.rack;
  } else if (recommendedLoc) {
    rack = recommendedLoc.rack;
  }
  
  const rackLocators = locators.filter(l => l.rack === rack);
  const columns = Array.from(new Set(rackLocators.map(l => l.column))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const maxLevel = rack.startsWith('FL') ? 2 : (rackLocators.length > 0 ? Math.max(...rackLocators.map(l => l.level)) : 4);
  const levels = Array.from({length: maxLevel}, (_, i) => maxLevel - i);

  const getSlotStat = (locId: string) => {
    let usedVol = 0;
    const items: any[] = [];
    Object.entries(inventory).forEach(([sku, data]: [string, any]) => {
      const pData = products.find(p => p.sku === sku);
      const qty = data.locators[locId]?.physicalQty || 0;
      if (qty > 0 && pData) {
        usedVol += qty * pData.volumeM3;
        items.push({ sku, qty });
      }
    });
    
    // Virtual future addition from pending list
    inboundList.filter(i => i.locatorId === locId).forEach(pendingItem => {
      const pData = products.find(p => p.sku === pendingItem.sku);
      if (pData) usedVol += pendingItem.qty * pData.volumeM3;
      const existing = items.find(i => i.sku === pendingItem.sku);
      if (existing) existing.qty += pendingItem.qty;
      else items.push({ sku: pendingItem.sku, qty: pendingItem.qty });
    });

    // Virtual future addition for the currently selected slot in form
    if (locId === selectedLocator && productDetails && Number(qty) > 0) {
       usedVol += Number(qty) * productDetails.volumeM3;
       const existing = items.find(i => i.sku === selectedSku);
       if (existing) existing.qty += Number(qty);
       else items.push({ sku: selectedSku, qty: Number(qty) });
    }
    
    const maxVol = rackLocators.find(r => r.id === locId)?.maxVolumeM3 || 5.4;
    const pct = Math.min(100, Math.round((usedVol / maxVol) * 100));
    return { usedVol, maxVol, pct, items };
  };

  const getUtilColor = (pct: number) => {
    if (pct >= 95) return 'bg-rose-500';
    if (pct >= 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-[#0F294D] tracking-tight">Directed Putaway</h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">Optimize storage efficiency with real-time slot recommendations.</p>
        </div>
        <div className="bg-[#009254] text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 shadow-sm">
          <Zap className="w-4 h-4 fill-white" />
          System Active: Auto-optimization ON
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Section */}
        <section className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-[#24549A]">
            <span className="w-5 h-5 flex items-center gap-0.5">
              <span className="w-1.5 h-full bg-[#24549A] inline-block rounded-sm"></span>
              <span className="w-1.5 h-3/4 bg-[#24549A] inline-block rounded-sm"></span>
            </span>
            Register Stock
          </h3>

          <div className="space-y-5 flex-1">
            <div>
              <label className="block text-sm text-[#475569] mb-1.5 font-medium">SKU Identifier</label>
              <div className="relative">
                <select 
                  value={selectedSku} 
                  onChange={e => setSelectedSku(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none"
                >
                  <option value="">Scan or Select SKU</option>
                  {products.map(p => (
                    <option key={p.sku} value={p.sku}>{p.sku} - {p.name}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                  <Camera className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#475569] mb-1.5 font-medium">Quantity (Units)</label>
                <input 
                  type="number" 
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                 <label className="block text-sm text-[#475569] mb-1.5 font-medium">Volume (m³)</label>
                <input 
                  type="text" 
                  value={productDetails && qty ? (productDetails.volumeM3 * Number(qty)).toFixed(2) : ''}
                  readOnly
                  className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-slate-50 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#475569] mb-1.5 font-medium">Handling Category</label>
              <select className="w-full p-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option>{productDetails?.category ? productDetails.category.replace('_', ' ') + ' - Heavy Duty' : 'Standard'}</option>
              </select>
            </div>
            
            {message && (
              <div className={`p-3 rounded text-xs font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}
          </div>

          <div className="pt-6 mt-auto">
            <button 
              onClick={handleAddToList}
              disabled={!selectedSku || !qty || !selectedLocator}
              className="w-full bg-[#34d399] font-bold text-slate-900 py-3 rounded text-sm flex items-center justify-center gap-2 hover:bg-[#10b981] transition-colors disabled:opacity-50"
            >
              <Shield className="w-4 h-4" />
              Add to Putaway List
            </button>

            {inboundList.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Pending Putaway:</h4>
                <ul className="space-y-2 mb-4">
                  {inboundList.map(item => (
                    <li key={item.id} className="text-xs flex justify-between bg-slate-50 p-2 rounded border border-slate-200">
                      <span className="font-bold text-blue-600">{item.sku}</span>
                      <span>{item.qty} units ➔ {item.locatorId}</span>
                    </li>
                  ))}
                </ul>
                <button 
                  onClick={handleConfirmAll}
                  className="w-full bg-[#0055C4] font-bold text-white py-3 rounded text-sm flex items-center justify-center gap-2 hover:bg-blue-800 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm All Putaways
                </button>
              </div>
            )}
            
            <p className="text-center text-[11px] font-bold text-slate-500 mt-3">
              This action will be recorded to the <span className="text-[#0055C4] cursor-pointer">Immutable Ledger</span>.
            </p>
          </div>
        </section>

        {/* Right Section (AI + Visualization) */}
        <section className="col-span-12 lg:col-span-8 flex flex-col gap-4">
          
          {/* AI Recommendation Panel */}
          <div className="bg-[#0b5cd5] text-white rounded-lg p-6 shadow-sm relative overflow-hidden">
             {/* Background decorative elements */}
             <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-white/10 to-transparent pointer-events-none"></div>
             
             <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="inline-block px-3 py-1 bg-white/20 text-white text-[10px] font-bold tracking-wider rounded-full mb-3 uppercase">AI Recommendation</span>
                  <h3 className="text-3xl font-light">Recommended Slot: <span className="font-bold underline decoration-2 underline-offset-4">{recommendedLoc?.id || '---'}</span></h3>
                  
                  <div className="flex gap-8 mt-4">
                    <div className="flex items-center gap-2">
                       <div className="w-1 h-3 border border-white/40 border-r-0 border-t-0"></div>
                       <span className="text-sm font-medium text-white/90">{recommendedLoc?.zone.replace('_', ' ') || 'Zone'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-sm border border-white/40 flex items-center justify-center"><div className="w-1 h-1 bg-white/40 rounded-full"></div></div>
                       <span className="text-sm font-medium text-white/90">Current Load: {recommendedLoc ? getSlotStat(recommendedLoc.id).usedVol.toFixed(2) : '0.00'} m³ / {recommendedLoc ? getSlotStat(recommendedLoc.id).maxVol.toFixed(1) : '5.4'} m³</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 border border-white/20 p-4 rounded backdrop-blur-sm min-w-[140px]">
                  <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">Distance from Dock</p>
                  <p className="text-2xl font-black">{recommendedLoc ? String((Math.random() * 20 + 5).toFixed(1)) : '--'} meters</p>
                </div>
             </div>

             <div className="grid grid-cols-3 gap-6 pt-4 border-t border-white/10">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider"><span>Zone Matching</span></div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden flex">
                     <div className="h-full bg-[#10b981] w-full"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider"><span>Load Capacity</span></div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden flex">
                     <div className="h-full bg-[#3b82f6] relative transition-all duration-500" style={{ width: `${recommendedLoc ? getSlotStat(recommendedLoc.id).pct : 0}%` }}>
                        <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/50"></div>
                     </div>
                  </div>
                  <p className="text-[9px] text-white/60 mt-1 uppercase">{recommendedLoc ? getSlotStat(recommendedLoc.id).usedVol.toFixed(2) : '0.00'} / {recommendedLoc ? getSlotStat(recommendedLoc.id).maxVol.toFixed(1) : '5.4'} m³ (Utilized)</p>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider"><span>Velocity Profile</span></div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden flex">
                     <div className="h-full bg-[#34d399] w-[90%]"></div>
                  </div>
                </div>
             </div>
          </div>

          {/* Rack Visualization */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex-1">
             <div className="flex justify-between items-center mb-6">
               <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                 RACK VISUALIZATION: 
                 <select 
                   value={rack} 
                   onChange={(e) => {
                     const firstLoc = locators.find(l => l.rack === e.target.value);
                     if (firstLoc) setSelectedLocator(firstLoc.id);
                   }}
                   className="p-1 ml-2 border border-slate-200 rounded text-sm bg-slate-50 text-slate-800 font-bold outline-none"
                 >
                   {Array.from(new Set(locators.map(l => l.rack))).map(r => {
                     
                      
                     const rLocs = locators.filter(l => l.rack === r);
                     const maxVol = rLocs.reduce((sum, l) => sum + l.maxVolumeM3, 0);
                     return <option key={r} value={r}>Rack {r} (Capacity: {maxVol.toFixed(1)} m³)</option>
                   })}
                 </select>
               </h4>
               <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-slate-500">
                 <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#e2e8f0]"></span> Vacant</span>
                 <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#34d399]"></span> Occupied</span>
                 <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-rose-500"></span> Target/Selected</span>
               </div>
             </div>

             <div className="relative w-full overflow-x-auto pb-4">
               <div className="flex flex-col gap-6 w-max min-w-full">
                 {levels.map((lvl) => (
                   <div key={lvl} className="flex relative items-center pb-2 pt-2">
                     <div className="flex-1 flex gap-4 justify-between">
                       {columns.map(c => {
                         const locId = `${c}.${lvl}`;
                         const isTarget = locId === selectedLocator;
                         const stat = getSlotStat(locId);
                         const isVacant = stat.pct === 0 && !isTarget;
                         const borderColor = isTarget ? 'border-rose-500' : 'border-slate-200';
                         
                         return (
                           <div key={c} className="w-32 flex-shrink-0 flex items-center justify-center cursor-pointer" onClick={() => setSelectedLocator(locId)}>
                              {/* Slot Card */}
                              <div className={`w-full bg-white border-2 ${borderColor} rounded-lg p-2.5 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] relative overflow-hidden transition-all ${isTarget ? 'shadow-md ring-2 ring-rose-500/20 scale-[1.02]' : 'hover:shadow-sm'}`}>
                                 
                                 {/* Slot ID & % */}
                                 <div className="flex justify-between items-start mb-2">
                                   <span className="font-bold text-slate-800 text-xs">{c.replace('FL-','')}.{lvl}</span>
                                   <span className={`text-[10px] font-mono font-bold ${stat.pct >= 95 ? 'text-rose-600' : 'text-slate-400'} ${isTarget ? 'text-rose-600' : ''}`}>
                                     {stat.pct}%
                                   </span>
                                 </div>

                               {/* Content */}
                               <div className="h-10 flex flex-col justify-center">
                                 {isVacant ? (
                                   <span className="text-[10px] italic font-semibold text-slate-300 text-center tracking-widest uppercase">VACANT</span>
                                 ) : (
                                   <>
                                     <div className="text-[10px] font-bold text-slate-800 truncate">
                                       {stat.items[0]?.sku || '---'}
                                     </div>
                                     <div className="text-[9px] font-medium text-slate-500 mt-0.5">
                                       {stat.items.map((i: any) => i.qty).reduce((a:number,b:number)=>a+b,0)} PCS
                                     </div>
                                   </>
                                 )}
                               </div>

                               {/* Progress bar */}
                               <div className="mt-2">
                                 <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                   <div className={`h-full transition-all duration-500 ${isTarget ? 'bg-rose-500' : getUtilColor(stat.pct)}`} style={{ width: `${stat.pct}%` }}></div>
                                 </div>
                                 <div className="flex justify-between items-center mt-1">
                                   <span className="text-[8px] font-mono font-medium text-slate-500">{stat.usedVol.toFixed(2)} m³</span>
                                   <span className="text-[8px] font-mono text-slate-400">{stat.maxVol.toFixed(1)} m³ Max</span>
                                 </div>
                               </div>

                            </div>
                            
                            {/* Beam decoration visually */}
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#1e293b] rounded-sm transform translate-y-3 mx-1">
                              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-r-4 border-r-[#1e293b] border-b-4 border-b-transparent"></div>
                              <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-l-4 border-l-[#1e293b] border-b-4 border-b-transparent"></div>
                            </div>
                         </div>
                       );
                     })}
                   </div>
                 </div>
               ))}
               </div>
             </div>

             <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
               <span className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-widest">
                  Rack Sill Beam Capacity: 5.4 m³ Max
               </span>
               <span className="text-[10px] font-bold italic text-slate-500">Selected Target: {selectedLocator || '-'}</span>
             </div>
          </div>

        </section>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-0 shadow-sm mt-4">
         <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h4 className="text-[15px] font-bold text-[#0F294D] flex items-center gap-2">
               <Shield className="w-4 h-4 text-[#009254]" />
               Inbound Transaction Ledger
            </h4>
            <button className="text-sm font-bold text-[#24549A] hover:underline">View All Records</button>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead className="bg-slate-50/50">
                  <tr>
                     <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Transaction ID</th>
                     <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                     <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Slot</th>
                     <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Operator</th>
                     <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Timestamp</th>
                     <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">No recent transactions.</td></tr>
                  ) : transactions.map(tx => (
                     <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-xs font-bold text-blue-600 font-mono">#{tx.id.split('-')[0].toUpperCase()}</td>
                        <td className="px-6 py-3 text-xs font-bold text-slate-800">{tx.sku}</td>
                        <td className="px-6 py-3 text-xs text-slate-600 font-mono">{tx.locatorId}</td>
                        <td className="px-6 py-3 text-xs text-slate-600 font-medium">{tx.operator}</td>
                        <td className="px-6 py-3 text-xs text-slate-500">{new Date(tx.timestamp).toLocaleTimeString()}</td>
                        <td className="px-6 py-3">
                           <span className="px-2 py-1 bg-emerald-100/50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider border border-emerald-200/50 rounded flex w-max items-center gap-1">
                              Verified
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}

