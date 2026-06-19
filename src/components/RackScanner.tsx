import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { ScanBarcode, Layers, AlertTriangle, CheckCircle2, RefreshCw, X, Box } from 'lucide-react';
import { getRackDetailsByBarcode } from '../lib/db';
import { getCurrentUser } from '../lib/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export function RackScanner() {
  const [scanResult, setScanResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const user = getCurrentUser();

  useEffect(() => {
    if (scannerActive) {
      if (!scannerRef.current) {
        scannerRef.current = new Html5QrcodeScanner(
          "rack-scanner-region",
          { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            rememberLastUsedCamera: true
          },
          false
        );

        scannerRef.current.render(onScanSuccess, onScanError);
      }
    } else {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [scannerActive]);

  const recordScanHistory = async (barcode: string, status: string) => {
    try {
      if (user) {
        await addDoc(collection(db, 'scan_history'), {
          user: user.username,
          rack: barcode,
          action: 'SCAN_RACK',
          status,
          timestamp: serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Error recording scan:", e);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    // Prevent double scan
    if (loading) return;
    
    // Attempt vibrate on scan
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
    
    setLoading(true);
    setScannerActive(false); // turn off camera temporarilly
    try {
      const res = await getRackDetailsByBarcode(decodedText);
      if (res.success) {
        setScanResult(res);
        setError('');
        await recordScanHistory(decodedText, 'SUCCESS');
      } else {
        setError(res.message);
        setScanResult(null);
        await recordScanHistory(decodedText, 'NOT_FOUND');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
      await recordScanHistory(decodedText, 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const onScanError = (errorMessage: string) => {
    // Ignore routine scan errors
  };

  const resetScanner = () => {
    setScanResult(null);
    setError('');
    setScannerActive(true);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <ScanBarcode className="w-6 h-6 text-blue-600" />
            Rack Scanner
          </h2>
          <p className="text-slate-500 text-sm mt-1">Scan barcode rak untuk melihat detail lokasi penyimpanan.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-slate-500" /> Camera Preview
            </h3>
          </div>
          <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px]">
            {scannerActive ? (
              <div id="rack-scanner-region" className="w-full"></div>
            ) : (
              <div className="text-center">
                <button 
                  onClick={resetScanner}
                  className="mx-auto flex flex-col items-center justify-center w-32 h-32 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors border border-blue-200"
                >
                  <RefreshCw className="w-8 h-8 mb-2" />
                  <span className="font-bold text-sm">Scan Ulang</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
           <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" /> Hasil Scan
            </h3>
          </div>
          <div className="flex-1 p-4">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            )}

            {!loading && error && (
              <div className="h-full flex flex-col justify-center text-center p-6 bg-red-50 rounded-xl border border-red-100">
                <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <h4 className="font-bold text-red-700 mb-1">Rack Tidak Ditemukan</h4>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {!loading && !scanResult && !error && (
              <div className="h-full flex flex-col justify-center text-center p-6 text-slate-400">
                <ScanBarcode className="w-16 h-16 mx-auto mb-3 opacity-20" />
                <p>Arahkan kamera ke barcode rak.</p>
              </div>
            )}

            {!loading && scanResult && scanResult.success && (
              <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <h4 className="font-black text-emerald-800 text-lg">Rack: {scanResult.rack.code}</h4>
                    </div>
                    <span className="bg-white px-3 py-1 rounded-full text-xs font-bold text-emerald-700 border border-emerald-200">
                      Zone: {scanResult.rack.zone.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-bold text-emerald-800">
                      <span>Kapasitas Digunakan</span>
                      <span>{scanResult.rack.usedCapacity.toFixed(2)} / {scanResult.rack.capacity} M³</span>
                    </div>
                    <div className="w-full bg-emerald-200/50 rounded-full h-3">
                      <div 
                        className="bg-emerald-500 h-3 rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.min(100, (scanResult.rack.usedCapacity / scanResult.rack.capacity) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
                    <Box className="w-4 h-4 text-slate-400" />
                    Isi Rak ({scanResult.items?.length || 0} Item)
                  </h4>

                  {scanResult.items.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                      <p className="text-slate-500 font-bold">Rack Kosong</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {scanResult.items.map((item: any, idx: number) => (
                        <div key={idx} className="bg-white border text-left border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between hover:border-blue-300 transition-colors">
                          <div className="min-w-0 pr-4">
                            <p className="font-black text-blue-700 text-sm truncate">{item.sku}</p>
                            <p className="text-xs text-slate-500 truncate">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                                Batch: {item.batch}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end">
                            <span className="text-lg font-black text-slate-800 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200 inline-block mb-1">
                              {item.qty} {item.uom || 'PCS'}
                            </span>
                            {item.packUom && item.packingSize && (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  ({Math.floor(item.qty / item.packingSize)} {item.packUom} + {item.qty % item.packingSize} {item.uom})
                                </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
