import React, { useState, useEffect } from 'react';
import { LogOut, Save, Printer, CheckCircle } from 'lucide-react';
import { Product } from '../types';

export function Outbound() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [options, setOptions] = useState<{locatorId: string, qty: number}[]>([]);
  const [selectedLocator, setSelectedLocator] = useState('');
  const [qty, setQty] = useState('');
  const [memo, setMemo] = useState('');
  const [transaction, setTransaction] = useState<any>(null);

  useEffect(() => {
    fetch('/api/master/products')
      .then(r => r.json())
      .then(setProducts);
  }, []);

  useEffect(() => {
    if (selectedSku) {
      fetch(`/api/outbound/options?sku=${selectedSku}`)
        .then(r => r.json())
        .then(data => {
          setOptions(data.available || []);
          setSelectedLocator('');
          setQty('');
          setTransaction(null);
        });
    }
  }, [selectedSku]);

  const handleSaveBook = async () => {
    if (!selectedSku || !selectedLocator || !qty) return;
    const res = await fetch('/api/outbound/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: selectedSku,
        locatorId: selectedLocator,
        qty: Number(qty),
        memo,
        operator: 'Alex Rivera'
      })
    });
    const data = await res.json();
    if (res.ok) {
      setTransaction(data.transaction);
    } else {
      alert(data.error);
    }
  };

  const handleConfirm = async () => {
    if (!transaction) return;
    const res = await fetch('/api/outbound/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: transaction.id })
    });
    if (res.ok) {
      alert('Transaction Confirmed!');
      // Reset form
      setSelectedSku('');
      setOptions([]);
      setTransaction(null);
      setMemo('');
      setQty('');
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
