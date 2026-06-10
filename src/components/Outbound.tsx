import React, { useState, useEffect } from 'react';
import { LogOut, Save, Printer, CheckCircle } from 'lucide-react';
import { Product } from '../types';
import { getProducts, getTransactions, addTransaction, updateTransactionStatus } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';

export function Outbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [options, setOptions] = useState<{locatorId: string, qty: number}[]>([]);
  const [selectedLocator, setSelectedLocator] = useState('');
  const [qty, setQty] = useState('');
  const [memo, setMemo] = useState('');
  const [transaction, setTransaction] = useState<any>(null);
  const [bookedTransactions, setBookedTransactions] = useState<any[]>([]);

  const refreshBookedTransactions = () => {
    getTransactions().then(txs => {
        setBookedTransactions(txs.filter(tx => tx.status === 'BOOKED' && tx.type === 'OUTBOUND'));
    }).catch(console.error);
  }

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error);
    refreshBookedTransactions();
  }, []);

  useEffect(() => {
    if (selectedSku) {
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
          .map(([locId, qty]) => ({ locatorId: locId, qty }));
          
        setOptions(available);
        setSelectedLocator('');
        setQty('');
        setTransaction(null);
      }).catch(console.error);
    }
  }, [selectedSku]);

  const handleSaveBook = async () => {
    if (!selectedSku || !selectedLocator || !qty) return;
    
    // Check validation
    const pickVal = Math.abs(Number(qty));
    const available = options.find(o => o.locatorId === selectedLocator)?.qty || 0;
    
    if (pickVal > available) {
      alert(`Insufficient stock in ${selectedLocator}. Available: ${available}, Requested: ${pickVal}. Please adjust the quantity or pick from another rack.`);
      return;
    }
    
    const tx = {
      id: uuidv4(),
      type: 'OUTBOUND' as const,
      sku: selectedSku,
      qty: -pickVal,
      locatorId: selectedLocator,
      operator: 'Alex Rivera',
      timestamp: new Date().toISOString(),
      status: 'BOOKED' as const,
      memo
    };
    
    try {
      await addTransaction(tx);
      setTransaction(tx);
      refreshBookedTransactions();
    } catch (err: any) {
      alert(err.message || "Error");
    }
  };

  const handleConfirm = async () => {
    if (!transaction) return;
    try {
      await updateTransactionStatus(transaction.id, 'CONFIRMED');
      alert('Transaction Confirmed!');
      // Reset form
      setSelectedSku('');
      setOptions([]);
      setTransaction(null);
      setMemo('');
      setQty('');
      refreshBookedTransactions();
    } catch (e: any) {
      alert(e.message || "Error");
    }
  };

  const productDetails = products.find(p => p.sku === selectedSku);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">FIFO Picking (Outbound)</h2>
          <p className="text-slate-500 mt-1 text-sm">Select inventory, book stock, and print manifest.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Form */}
        <section className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
            <LogOut className="text-blue-600 w-6 h-6" />
            Pick Stock
          </h3>

          <div className="space-y-5 flex flex-col h-full">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Select SKU</label>
              <select 
                value={selectedSku} 
                onChange={e => setSelectedSku(e.target.value)}
                disabled={!!transaction}
                className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 disabled:opacity-50"
              >
                <option value="">-- Choose Product --</option>
                {products.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} - {p.name}</option>
                ))}
              </select>
            </div>

            {selectedSku && options.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Available Locators</label>
                <select 
                  value={selectedLocator} 
                  onChange={e => setSelectedLocator(e.target.value)}
                  disabled={!!transaction}
                  className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 font-mono disabled:opacity-50"
                >
                  <option value="">-- Select Source Locator --</option>
                  {options.map(o => (
                    <option key={o.locatorId} value={o.locatorId}>
                      {o.locatorId} (Available Qty: {o.qty})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedLocator && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Pick Quantity</label>
                  <input 
                    type="number" 
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    disabled={!!transaction}
                    className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 font-mono disabled:opacity-50"
                  />
                  {selectedLocator && options.find(o => o.locatorId === selectedLocator) && (
                     <div className="mt-1 text-xs text-slate-500">
                       Max available: {options.find(o => o.locatorId === selectedLocator)?.qty}
                     </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Memo / Notes</label>
                  <input 
                    type="text" 
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    disabled={!!transaction}
                    className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 disabled:opacity-50"
                  />
                </div>

                {!transaction && (
                  <div className="pt-4">
                    <button 
                      onClick={handleSaveBook}
                      disabled={!qty || Number(qty) <= 0}
                      className="w-full bg-blue-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-50"
                    >
                      <Save className="w-5 h-5" />
                      Save & Book
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Print / Confirm Section */}
        {transaction && (
          <section className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold mb-6 text-slate-800">Booking Summary</h3>
              
              <div id="print-area" className="p-6 border-2 border-slate-800 rounded-lg bg-white text-slate-900 printable-content">
                <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
                  <h2 className="text-2xl font-black uppercase tracking-widest">GUDANG PSN</h2>
                  <p className="font-mono text-sm mt-1">OUTBOUND MANIFEST</p>
                </div>
                
                <table className="w-full text-left mb-6 font-mono text-sm">
                  <tbody>
                    <tr><td className="py-2 font-bold w-32">TX ID:</td><td>{transaction.id}</td></tr>
                    <tr><td className="py-2 font-bold">DATE:</td><td>{new Date(transaction.timestamp).toLocaleString()}</td></tr>
                    <tr><td className="py-2 font-bold">SKU:</td><td>{productDetails?.name} ({transaction.sku})</td></tr>
                    <tr><td className="py-2 font-bold">LOCATOR:</td><td>{transaction.locatorId}</td></tr>
                    <tr><td className="py-2 font-bold">QUANTITY:</td><td className="text-lg font-black">{Math.abs(transaction.qty)}</td></tr>
                    <tr><td className="py-2 font-bold">MEMO:</td><td>{transaction.memo || '-'}</td></tr>
                  </tbody>
                </table>

                <div className="mt-12 flex justify-between px-8">
                  <div className="text-center">
                    <div className="h-16 border-b border-slate-400 w-32 mx-auto"></div>
                    <p className="font-bold text-xs mt-2 uppercase">Operator</p>
                  </div>
                  <div className="text-center">
                    <div className="h-16 border-b border-slate-400 w-32 mx-auto"></div>
                    <p className="font-bold text-xs mt-2 uppercase">Admin Gudang</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 print:hidden">
              <button 
                onClick={() => window.print()}
                className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-900"
              >
                <Printer className="w-5 h-5" />
                Print PDF
              </button>
              
              <button 
                onClick={handleConfirm}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-emerald-700"
              >
                <CheckCircle className="w-5 h-5" />
                Admin Confirm Departure
              </button>
            </div>
          </section>
        )}
      </div>

      {bookedTransactions.length > 0 && (
        <section className="bg-white border border-amber-200 rounded-xl p-8 shadow-sm">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-amber-800">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            Pending Booked Transactions
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Locator</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookedTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-amber-50 cursor-pointer transition-colors" onClick={() => {
                    setSelectedSku(tx.sku);
                    // need to set options so locator is valid
                    getTransactions().then(txs => {
                      const locatorStock: Record<string, number> = {};
                      for (const t of txs) {
                        // don't exclude current tx so we can pick it
                        if (t.status === 'CANCELLED' || t.status === 'PENDING') continue;
                        if (t.sku === tx.sku) {
                          if (!locatorStock[t.locatorId]) locatorStock[t.locatorId] = 0;
                          locatorStock[t.locatorId] += t.qty;
                        }
                      }
                      
                      // For a pending booked transaction, we need our own qty back in there essentially, 
                      // actually it doesn't matter much as long as it's in the list
                      // It will show up anyway since locatorStock will reflect it.
                      const available = Object.entries(locatorStock)
                        .filter(([_, q]) => q !== 0) // could be 0 but we want to show it
                        .map(([locId, q]) => ({ locatorId: locId, qty: q }));
                        
                      setOptions(available);
                      setSelectedLocator(tx.locatorId);
                      setQty(Math.abs(tx.qty).toString());
                      setMemo(tx.memo || '');
                      setTransaction(tx);
                    });
                  }}>
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">{new Date(tx.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 font-mono tracking-tight">{tx.sku}</td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-600">{tx.locatorId}</td>
                    <td className="px-6 py-4 text-sm font-bold text-amber-600 font-mono">{Math.abs(tx.qty)}</td>
                    <td className="px-6 py-4 text-sm text-right">
                      <button className="text-amber-700 font-bold hover:underline">Review & Confirm</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none;
          }
        }
      `}} />
    </div>
  );
}
