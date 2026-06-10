import React, { useState, useEffect } from 'react';
import { Barcode, CheckCircle2, AlertCircle } from 'lucide-react';
import { Product, Locator } from '../types';
import { getProducts, getPutawayRecommendations, addTransaction } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';

export function Inbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [qty, setQty] = useState('');
  const [recommendations, setRecommendations] = useState<Locator[]>([]);
  const [selectedLocator, setSelectedLocator] = useState('');
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error);
  }, []);

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

  const handleConfirm = async () => {
    if (!selectedSku || !qty || !selectedLocator) {
      setMessage({ type: 'error', text: 'Please complete all fields' });
      return;
    }

    try {
      const tx = {
         id: uuidv4(),
         type: 'INBOUND' as const,
         sku: selectedSku,
         qty: Math.abs(Number(qty)),
         locatorId: selectedLocator,
         operator: 'Alex Rivera',
         timestamp: new Date().toISOString(),
         status: 'CONFIRMED' as const
      };
      await addTransaction(tx);
      setMessage({ type: 'success', text: 'Putaway registered successfully!' });
      setQty('');
      setSelectedSku('');
      setRecommendations([]);
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const productDetails = products.find(p => p.sku === selectedSku);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Directed Putaway</h2>
          <p className="text-slate-500 mt-1 text-sm">Optimize storage efficiency with real-time slot recommendations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Form Section */}
        <section className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
            <Barcode className="text-blue-600 w-6 h-6" />
            Register Stock
          </h3>

          {message && (
            <div className={`p-4 mb-6 rounded-lg flex items-center gap-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>}
              {message.text}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Select SKU</label>
              <select 
                value={selectedSku} 
                onChange={e => setSelectedSku(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">-- Choose Product --</option>
                {products.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} - {p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Quantity (Units)</label>
              <input 
                type="number" 
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="Enter quantity..."
                className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
              />
            </div>

            {productDetails && qty && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm font-bold text-slate-700">Calculated Volume</p>
                <p className="text-2xl font-black text-blue-700">{(productDetails.volumeM3 * Number(qty)).toFixed(2)} m³</p>
              </div>
            )}

            <div className="pt-4">
              <button 
                onClick={handleConfirm}
                disabled={!selectedSku || !qty || !selectedLocator}
                className="w-full bg-blue-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-800 transition-colors disabled:opacity-50 shadow-md"
              >
                <CheckCircle2 className="w-5 h-5" />
                Confirm Putaway
              </button>
            </div>
          </div>
        </section>

        {/* Recommendations */}
        <section className="col-span-12 lg:col-span-7 bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <h3 className="text-xl font-bold mb-6 text-slate-800">AI Recommendation</h3>
          
          {loading ? (
             <div className="text-slate-500 py-10 text-center animate-pulse">Calculating optimal locators...</div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-4">
              {recommendations.map((loc, idx) => (
                <div 
                  key={loc.id} 
                  onClick={() => setSelectedLocator(loc.id)}
                  className={`p-6 border-2 rounded-xl cursor-pointer transition-all ${
                    selectedLocator === loc.id 
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm' 
                      : 'border-slate-100 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      {idx === 0 && <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-black uppercase rounded-full tracking-wide mb-2 inline-block">Best Match</span>}
                      <h4 className="text-2xl font-black text-slate-800">Slot: {loc.id}</h4>
                      <p className="text-sm font-bold text-slate-500 mt-1">Zone: {loc.zone.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase">Max Volume limit</p>
                      <p className="text-lg font-bold text-slate-700">{loc.maxVolumeM3} m³</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-400 py-10 text-center border-2 border-dashed border-slate-200 rounded-xl">
              {selectedSku && qty ? "No matching racks with enough capacity found." : "Select SKU and Quantity to see recommendations"}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
