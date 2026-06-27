import { db } from '../firebase';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Locator, Product, Transaction, ZoneCategory } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const getProductDocId = (sku: string): string => {
  return encodeURIComponent(sku);
};

export const getCurrentCompanyId = () => {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            if (user && user.companyId) return user.companyId;
        } catch(e) {}
    }
    return '';
}

export const getCurrentWarehouseId = () => {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            if (user && user.warehouseId) return user.warehouseId;
        } catch(e) {}
    }
    return 'MAIN_WH';
}

export const isGlobalDeveloper = () => {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            return user.role === 'Developer';
        } catch(e) {}
    }
    return false;
}

// Global In-Memory Cache layer for rapid data loads and 0-delay page/tab switching
interface CacheStore {
  products: Product[] | null;
  locators: Locator[] | null;
  transactions: Transaction[] | null;
  physicalStockCounts: any | null;
  inventoryDetails: any | null;
}

const cache: CacheStore = {
  products: null,
  locators: null,
  transactions: null,
  physicalStockCounts: null,
  inventoryDetails: null
};

const saveToLocal = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('LocalStorage save failed', e);
  }
};

const getFromLocal = (key: string): any => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    return null;
  }
};

const addProductLocal = (product: Product) => {
  const companyId = product.companyId || getCurrentCompanyId();
  if (!companyId) return;
  const list = getFromLocal('local_products_' + companyId) || [];
  const index = list.findIndex((p: any) => p.sku === product.sku);
  if (index >= 0) {
    list[index] = product;
  } else {
    list.push(product);
  }
  saveToLocal('local_products_' + companyId, list);
  cache.products = list;
};

const deleteProductLocal = (sku: string) => {
  const companyId = getCurrentCompanyId();
  if (!companyId) return;
  const list = getFromLocal('local_products_' + companyId) || [];
  const updated = list.filter((p: any) => p.sku !== sku);
  saveToLocal('local_products_' + companyId, updated);
  cache.products = updated;
};

const addLocatorLocal = (locator: Locator) => {
  const companyId = locator.companyId || getCurrentCompanyId();
  if (!companyId) return;
  const list = getFromLocal('local_locators_' + companyId) || [];
  const index = list.findIndex((l: any) => l.id === locator.id);
  if (index >= 0) {
    list[index] = locator;
  } else {
    list.push(locator);
  }
  saveToLocal('local_locators_' + companyId, list);
  cache.locators = list;
};

const deleteLocatorLocal = (id: string) => {
  const companyId = getCurrentCompanyId();
  if (!companyId) return;
  const list = getFromLocal('local_locators_' + companyId) || [];
  const updated = list.filter((l: any) => l.id !== id);
  saveToLocal('local_locators_' + companyId, updated);
  cache.locators = updated;
};

const addTransactionLocal = (tx: Transaction) => {
  const companyId = tx.companyId || getCurrentCompanyId();
  if (!companyId) return;
  const list = getFromLocal('local_transactions_' + companyId) || [];
  const index = list.findIndex((t: any) => t.id === tx.id);
  if (index >= 0) {
    list[index] = tx;
  } else {
    list.unshift(tx);
  }
  saveToLocal('local_transactions_' + companyId, list);
  cache.transactions = list;
};

interface PromiseStore {
  products: Promise<Product[]> | null;
  locators: Promise<Locator[]> | null;
  transactions: Promise<Transaction[]> | null;
  physicalStockCounts: Promise<any> | null;
  inventoryDetails: Promise<any> | null;
}

const promises: PromiseStore = {
  products: null,
  locators: null,
  transactions: null,
  physicalStockCounts: null,
  inventoryDetails: null
};

let cachedCompanyId: string | null = null;

export const clearCache = (type?: keyof CacheStore) => {
  if (type) {
    cache[type] = null;
    promises[type] = null;
    // Clearing dependent caches
    if (type === 'transactions' || type === 'products' || type === 'locators') {
      cache.inventoryDetails = null;
      promises.inventoryDetails = null;
    }
  } else {
    for (const key of Object.keys(cache) as (keyof CacheStore)[]) {
      cache[key] = null;
      promises[key] = null;
    }
  }
};

const checkCompanyChanged = () => {
  const currentCompanyId = getCurrentCompanyId();
  if (cachedCompanyId !== currentCompanyId) {
    clearCache();
    cachedCompanyId = currentCompanyId;
  }
};

export const getProducts = async (): Promise<Product[]> => {
  checkCompanyChanged();
  if (cache.products) return cache.products;
  if (promises.products) return promises.products;

  promises.products = (async () => {
    const companyId = getCurrentCompanyId();
    try {
      const q = (!isGlobalDeveloper() && companyId) ? query(collection(db, 'products'), where('companyId', '==', companyId)) : collection(db, 'products');
      const snapshot = await getDocs(q as any);
      const products: Product[] = [];
      snapshot.forEach(doc => {
        products.push(doc.data() as Product);
      });
      if (companyId) {
        saveToLocal('local_products_' + companyId, products);
      }
      cache.products = products;
      promises.products = null;
      return products;
    } catch (err) {
      console.warn("getProducts Firestore failed, trying local storage", err);
      const fallback = companyId ? getFromLocal('local_products_' + companyId) : null;
      if (fallback) {
        cache.products = fallback;
        promises.products = null;
        return fallback;
      }
      const empty: Product[] = [];
      cache.products = empty;
      promises.products = null;
      return empty;
    }
  })();

  return promises.products;
};

export const getLocators = async (): Promise<Locator[]> => {
  checkCompanyChanged();
  if (cache.locators) return cache.locators;
  if (promises.locators) return promises.locators;

  promises.locators = (async () => {
    const companyId = getCurrentCompanyId();
    try {
      const q = (!isGlobalDeveloper() && companyId) ? query(collection(db, 'locators'), where('companyId', '==', companyId)) : collection(db, 'locators');
      const snapshot = await getDocs(q as any);
      const locators: Locator[] = [];
      snapshot.forEach(doc => {
        locators.push(doc.data() as Locator);
      });
      if (companyId) {
        saveToLocal('local_locators_' + companyId, locators);
      }
      cache.locators = locators;
      promises.locators = null;
      return locators;
    } catch (err) {
      console.warn("getLocators Firestore failed, trying local storage", err);
      const fallback = companyId ? getFromLocal('local_locators_' + companyId) : null;
      if (fallback) {
        cache.locators = fallback;
        promises.locators = null;
        return fallback;
      }
      const empty: Locator[] = [];
      cache.locators = empty;
      promises.locators = null;
      return empty;
    }
  })();

  return promises.locators;
};

export const addLocator = async (locator: Locator) => {
  locator.companyId = locator.companyId || getCurrentCompanyId();
  addLocatorLocal(locator);
  try {
    await setDoc(doc(db, 'locators', locator.id), locator);
  } catch (err) {
    console.warn("addLocator Firestore failed, using local only", err);
  }
  clearCache('locators');
};

export const updateLocator = async (id: string, data: Partial<Locator>) => {
  const companyId = getCurrentCompanyId();
  const list = getFromLocal('local_locators_' + companyId) || [];
  const index = list.findIndex((l: any) => l.id === id);
  if (index >= 0) {
    list[index] = { ...list[index], ...data };
    saveToLocal('local_locators_' + companyId, list);
    cache.locators = list;
  }
  try {
    await updateDoc(doc(db, 'locators', id), data as any);
  } catch (err) {
    console.warn("updateLocator Firestore failed, using local only", err);
  }
  clearCache('locators');
};

export const deleteLocator = async (id: string) => {
  deleteLocatorLocal(id);
  try {
    await deleteDoc(doc(db, 'locators', id));
  } catch (err) {
    console.warn("deleteLocator Firestore failed, using local only", err);
  }
  clearCache('locators');
};

export const addProduct = async (product: Product) => {
  product.companyId = product.companyId || getCurrentCompanyId();
  addProductLocal(product);
  try {
    await setDoc(doc(db, 'products', getProductDocId(product.sku)), product);
  } catch (err) {
    console.warn("addProduct Firestore failed, using local only", err);
  }
  clearCache('products');
};

export const addProductWithStock = async (product: Product, qty: number, locatorId: string, operator: string) => {
  product.companyId = product.companyId || getCurrentCompanyId();
  addProductLocal(product);

  let tx: Transaction | null = null;
  if (qty > 0 && locatorId) {
    const txId = uuidv4();
    tx = {
      id: txId,
      companyId: product.companyId,
      type: 'INBOUND',
      sku: product.sku,
      qty: qty,
      locatorId: locatorId,
      operator: operator || 'System',
      timestamp: new Date().toISOString(),
      status: 'CONFIRMED',
      memo: 'Initial On-Hand Stock Setup'
    };
    addTransactionLocal(tx);
  }

  try {
    const batch = writeBatch(db);
    const productRef = doc(db, 'products', getProductDocId(product.sku));
    batch.set(productRef, product);

    if (tx) {
      const txRef = doc(db, 'transactions', tx.id);
      batch.set(txRef, tx);
    }
    await batch.commit();
  } catch (err) {
    console.warn("addProductWithStock Firestore failed, using local only", err);
  }

  clearCache('products');
  clearCache('transactions');
};

export const updateProduct = async (sku: string, data: Partial<Product>) => {
  const companyId = getCurrentCompanyId();
  const list = getFromLocal('local_products_' + companyId) || [];
  const index = list.findIndex((p: any) => p.sku === sku);
  if (index >= 0) {
    list[index] = { ...list[index], ...data };
    saveToLocal('local_products_' + companyId, list);
    cache.products = list;
  }
  try {
    await updateDoc(doc(db, 'products', getProductDocId(sku)), data as any);
  } catch (err) {
    console.warn("updateProduct Firestore failed, using local only", err);
  }
  clearCache('products');
};

export const deleteProduct = async (sku: string) => {
  deleteProductLocal(sku);
  try {
    await deleteDoc(doc(db, 'products', getProductDocId(sku)));
  } catch (err) {
    console.warn("deleteProduct Firestore failed, using local only", err);
  }
  clearCache('products');
};

export const addProductsBatch = async (products: Product[]) => {
  for (const p of products) {
    p.companyId = p.companyId || getCurrentCompanyId();
    addProductLocal(p);
  }
  try {
    const batch = writeBatch(db);
    for (const p of products) {
      const ref = doc(db, 'products', getProductDocId(p.sku));
      batch.set(ref, p, { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.warn("addProductsBatch Firestore failed, using local only", err);
  }
  clearCache('products');
};

export const addProductsBatchWithStock = async (
  items: { product: Product; qty?: number; locatorId?: string }[],
  operator: string
) => {
  const companyId = getCurrentCompanyId();
  const txsToCreate: Transaction[] = [];

  for (const item of items) {
    item.product.companyId = item.product.companyId || companyId;
    addProductLocal(item.product);

    if (item.qty && item.qty > 0 && item.locatorId) {
      const txId = uuidv4();
      const tx: Transaction = {
        id: txId,
        companyId: item.product.companyId,
        type: 'INBOUND',
        sku: item.product.sku,
        qty: item.qty,
        locatorId: item.locatorId,
        operator: operator || 'System',
        timestamp: new Date().toISOString(),
        status: 'CONFIRMED',
        memo: 'CSV Import Stock Setup'
      };
      txsToCreate.push(tx);
      addTransactionLocal(tx);
    }
  }

  try {
    const batch = writeBatch(db);
    for (const item of items) {
      const productRef = doc(db, 'products', getProductDocId(item.product.sku));
      batch.set(productRef, item.product, { merge: true });
    }
    for (const tx of txsToCreate) {
      const txRef = doc(db, 'transactions', tx.id);
      batch.set(txRef, tx);
    }
    await batch.commit();
  } catch (err) {
    console.warn("addProductsBatchWithStock Firestore failed, using local only", err);
  }

  clearCache('products');
  clearCache('transactions');
};

export const getTransactions = async (): Promise<Transaction[]> => {
  checkCompanyChanged();
  if (cache.transactions) return cache.transactions;
  if (promises.transactions) return promises.transactions;

  promises.transactions = (async () => {
    const companyId = getCurrentCompanyId();
    try {
      const q = (!isGlobalDeveloper() && companyId) ? query(collection(db, 'transactions'), where('companyId', '==', companyId)) : collection(db, 'transactions');
      const snapshot = await getDocs(q as any);
      const transactions: Transaction[] = [];
      snapshot.forEach(doc => {
        transactions.push(doc.data() as Transaction);
      });
      const sorted = transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (companyId) {
        saveToLocal('local_transactions_' + companyId, sorted);
      }
      cache.transactions = sorted;
      promises.transactions = null;
      return sorted;
    } catch (err) {
      console.warn("getTransactions Firestore failed, trying local storage", err);
      const fallback = companyId ? getFromLocal('local_transactions_' + companyId) : null;
      if (fallback) {
        cache.transactions = fallback;
        promises.transactions = null;
        return fallback;
      }
      const empty: Transaction[] = [];
      cache.transactions = empty;
      promises.transactions = null;
      return empty;
    }
  })();

  return promises.transactions;
};

export const addTransaction = async (tx: Transaction) => {
  tx.companyId = tx.companyId || getCurrentCompanyId();
  addTransactionLocal(tx);
  try {
    await setDoc(doc(db, 'transactions', tx.id), tx);
  } catch (err) {
    console.warn("addTransaction Firestore failed, using local only", err);
  }
  clearCache('transactions');
};

export const updateTransactionStatus = async (id: string, status: Transaction['status']) => {
  const companyId = getCurrentCompanyId();
  const list = getFromLocal('local_transactions_' + companyId) || [];
  const index = list.findIndex((t: any) => t.id === id);
  if (index >= 0) {
    list[index] = { ...list[index], status };
    saveToLocal('local_transactions_' + companyId, list);
    cache.transactions = list;
  }
  try {
    await updateDoc(doc(db, 'transactions', id), { status });
  } catch (err) {
    console.warn("updateTransactionStatus Firestore failed, using local only", err);
  }
  clearCache('transactions');
};

export const deleteTransactions = async (ids: string[]) => {
  const companyId = getCurrentCompanyId();
  if (companyId) {
    const list = getFromLocal('local_transactions_' + companyId) || [];
    const updated = list.filter((t: any) => !ids.includes(t.id));
    saveToLocal('local_transactions_' + companyId, updated);
    cache.transactions = updated;
  }
  
  try {
    let batch = writeBatch(db);
    let count = 0;
    for (const id of ids) {
      batch.delete(doc(db, 'transactions', id));
      count++;
      if (count === 500) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn("deleteTransactions Firestore failed, using local only", err);
    // Fallback individual deletes in case batch fails
    for (const id of ids) {
      try {
        await deleteDoc(doc(db, 'transactions', id));
      } catch (innerErr) {}
    }
  }
  clearCache('transactions');
};

export const getInventoryStats = async () => {
    const locators = await getLocators();
    const transactions = await getTransactions();
    const products = await getProducts();

    let totalMaxVolume = 0;
    for (const loc of locators) totalMaxVolume += loc.maxVolumeM3;
  
    let totalUsedVolume = 0;
    let activeInbound = 0;
    let pendingOutbound = 0;
  
    for (const tx of transactions) {
      if (tx.status === 'CANCELLED') continue;
      
      if (tx.status === 'PENDING') {
        if (tx.type === 'INBOUND') activeInbound++;
      } else if (tx.status === 'BOOKED' && tx.type === 'OUTBOUND') {
        pendingOutbound++;
      }
  
      if (tx.status === 'CONFIRMED' || (tx.type === 'OUTBOUND' && tx.status === 'BOOKED')) {
        const p = products.find(x => x.sku === tx.sku);
        if (p) {
          if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
            totalUsedVolume += (tx.qty * p.volumeM3);
          } else if (tx.type === 'OUTBOUND' && tx.status === 'CONFIRMED') {
            totalUsedVolume += (tx.qty * p.volumeM3);
          }
        }
      }
    }
  
    const occupancy = totalMaxVolume > 0 ? (totalUsedVolume / totalMaxVolume) * 100 : 0;
  
    return {
      occupancy: Math.max(0, Math.min(100, Math.round(occupancy * 10) / 10)),
      inbound: activeInbound, 
      outbound: pendingOutbound
    };
};

export const getInventoryDetails = async (): Promise<Record<string, {
  totalAvailableQty: number; 
  totalPhysicalQty: number;
  locators: Record<string, { availableQty: number; physicalQty: number; earliestInbound?: string }> 
}>> => {
    checkCompanyChanged();
    if (cache.inventoryDetails) return cache.inventoryDetails;
    if (promises.inventoryDetails) return promises.inventoryDetails;

    promises.inventoryDetails = (async () => {
        const transactions = await getTransactions();
        // Sort transactions chronological (oldest to newest) to correctly build FIFO queues
        const chronologicalTxs = [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const inventory: Record<string, {
          totalAvailableQty: number; 
          totalPhysicalQty: number;
          locators: Record<string, { availableQty: number; physicalQty: number; earliestInbound?: string }> 
        }> = {};

        const fifoQueues: Record<string, { qty: number, timestamp: string }[]> = {};
        
        for (const tx of chronologicalTxs) {
          if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
          
          if (!inventory[tx.sku]) {
            inventory[tx.sku] = { totalAvailableQty: 0, totalPhysicalQty: 0, locators: {} };
          }
          if (!inventory[tx.sku].locators[tx.locatorId]) {
            inventory[tx.sku].locators[tx.locatorId] = { availableQty: 0, physicalQty: 0 };
          }

          const queueKey = `${tx.sku}_${tx.locatorId}`;
          if (!fifoQueues[queueKey]) fifoQueues[queueKey] = [];
      
          let availableChange = tx.qty; 
          let physicalChange = 0;
      
          if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
            physicalChange = tx.qty;
            fifoQueues[queueKey].push({ qty: tx.qty, timestamp: tx.timestamp });
          } else if (tx.type === 'OUTBOUND') {
            if (tx.status === 'CONFIRMED') {
              physicalChange = tx.qty;
            } else if (tx.status === 'BOOKED') {
              physicalChange = 0;
            }

            // Deduct from FIFO queue
            let remainingToDeduct = Math.abs(tx.qty);
            while (remainingToDeduct > 0 && fifoQueues[queueKey].length > 0) {
              if (fifoQueues[queueKey][0].qty <= remainingToDeduct) {
                 remainingToDeduct -= fifoQueues[queueKey][0].qty;
                 fifoQueues[queueKey].shift();
              } else {
                 fifoQueues[queueKey][0].qty -= remainingToDeduct;
                 remainingToDeduct = 0;
              }
            }
          }
      
          inventory[tx.sku].totalAvailableQty += availableChange;
          inventory[tx.sku].totalPhysicalQty += physicalChange;
          
          inventory[tx.sku].locators[tx.locatorId].availableQty += availableChange;
          inventory[tx.sku].locators[tx.locatorId].physicalQty += physicalChange;
        }

        // Assign earliest inbound date to each locator
        for (const sku of Object.keys(inventory)) {
          for (const locId of Object.keys(inventory[sku].locators)) {
             const queueKey = `${sku}_${locId}`;
             if (fifoQueues[queueKey] && fifoQueues[queueKey].length > 0) {
               inventory[sku].locators[locId].earliestInbound = fifoQueues[queueKey][0].timestamp;
             }
          }
        }
      
        cache.inventoryDetails = inventory;
        promises.inventoryDetails = null;
        return inventory;
    })();

    return promises.inventoryDetails;
};

export const getRackDetailsByBarcode = async (barcode: string) => {
  // We use `id` or `barcode` as barcode lookup
  const locRef = doc(db, 'locators', barcode);
  const locSnap = await getDoc(locRef);
  
  let rackData = locSnap.exists() ? locSnap.data() as Locator : null;

  if (!rackData) {
    // Try to find by id or barcode field
    const locatorsRef = collection(db, 'locators');
    // For id:
    let q = query(locatorsRef, where('id', '==', barcode));
    let querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
       // Search by barcode field
       q = query(locatorsRef, where('barcode', '==', barcode));
       querySnapshot = await getDocs(q);
    }
    
    if (querySnapshot.empty) {
      return { success: false, message: "Rack tidak ditemukan" };
    }
    rackData = querySnapshot.docs[0].data() as Locator;
  }

  const theRack = rackData;

  const products = await getProducts();
  const transactions = await getTransactions();

  let usedVolume = 0;
  const itemsMap: Record<string, { sku: string, name: string, qty: number, batch: string, expired: string, uom: string, packUom?: string, packingSize?: number }> = {};

  for (const tx of transactions) {
    if (tx.locatorId !== theRack.id || tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
    
    if (!itemsMap[tx.sku]) {
      const p = products.find(x => x.sku === tx.sku);
      if (!p) continue;
      itemsMap[tx.sku] = { 
        sku: tx.sku, 
        name: p.name, 
        qty: 0, 
        batch: 'N/A', 
        expired: 'N/A',
        uom: p.uom,
        packUom: p.packUom,
        packingSize: p.packingSize
      };
    }

    if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
      itemsMap[tx.sku].qty += tx.qty;
    } else if (tx.type === 'OUTBOUND' && (tx.status === 'CONFIRMED' || tx.status === 'BOOKED')) {
      itemsMap[tx.sku].qty += tx.qty; // Note: OUTBOUND qty is negative
    }
  }

  const items = [];
  for (const sku in itemsMap) {
    const item = itemsMap[sku];
    if (item.qty > 0) {
      const p = products.find(x => x.sku === sku);
      usedVolume += (item.qty * (p?.volumeM3 || 0));
      items.push(item);
    }
  }

  return {
    success: true,
    rack: {
      code: theRack.id,
      zone: theRack.zone,
      capacity: theRack.maxVolumeM3,
      usedCapacity: usedVolume
    },
    items
  };
};

export const transferInventory = async (sku: string, fromLocatorId: string, toLocatorId: string, qty: number, operator: string) => {
  const companyId = getCurrentCompanyId();
  const batch = writeBatch(db);
  const outTxId = uuidv4();
  const inTxId = uuidv4();

  batch.set(doc(db, 'transactions', outTxId), {
    id: outTxId,
    companyId,
    type: 'OUTBOUND',
    sku,
    qty: -qty,
    locatorId: fromLocatorId,
    operator: operator || 'System',
    timestamp: new Date().toISOString(),
    status: 'CONFIRMED',
    memo: `Transfer to ${toLocatorId}`
  });

  batch.set(doc(db, 'transactions', inTxId), {
    id: inTxId,
    companyId,
    type: 'INBOUND',
    sku,
    qty: qty,
    locatorId: toLocatorId,
    operator: operator || 'System',
    timestamp: new Date().toISOString(),
    status: 'CONFIRMED',
    memo: `Transfer from ${fromLocatorId}`
  });

  await batch.commit();
  clearCache('transactions');
};

export const getAlowedRacksForCategory = (category: string): string[] => {
  const cat = (category || '').trim().toUpperCase().replace(/[\s-_]+/g, ' ');
  
  if (cat.includes('PLUMBING') || cat.includes('PLUMB')) {
    return ['R1', 'FL-A', 'FL-B'];
  }
  if (cat.includes('WATER FILTER') || cat.includes('FG WATER FILTER') || cat.includes('FG_WATER_FILTER')) {
    return ['R7'];
  }
  if (cat.includes('FILTER') || cat.includes('FG FILTER')) {
    return ['R2', 'R3'];
  }
  if (cat.includes('SMART WATER') || cat.includes('SMART_WATER') || cat.includes('FG SMART WATER') || cat.includes('FG_SMART_WATER')) {
    return ['R4', 'FL-E', 'FL-F'];
  }
  if (cat.includes('FITTING') || cat.includes('FG FITTING') || cat.includes('FG_FITTING')) {
    return ['R5', 'FL-E', 'FL-F'];
  }
  if (
    cat.includes('PACKAGING') || 
    cat.includes('PACKAGING MATERIALS') || 
    cat.includes('PACKAGING_MATERIALS') || 
    cat.includes('AKSESORIS') || 
    cat.includes('ACCESSOR')
  ) {
    return ['R6'];
  }
  if (
    cat.includes('OTO VALVE') || 
    cat.includes('OTO_VALVE') || 
    cat.includes('PART MESIN') || 
    cat.includes('PART_MESIN') || 
    cat.includes('PERSEDIAAN PART MESIN')
  ) {
    return ['R7'];
  }
  return ['R8'];
};

export const getPutawayRecommendations = async (sku: string, qty: number) => {
    const products = await getProducts();
    const locators = await getLocators();
    const transactions = await getTransactions();

    const product = products.find(p => p.sku === sku);
    if (!product) throw new Error("Product not found");

    const requestedVol = product.volumeM3 * qty;
    const zoneLocators = locators.filter(l => l.zone === product.category);
  
    const getAvailable = (candidates: typeof locators) => {
      const locatorUsage: Record<string, number> = {};
      for (const l of candidates) locatorUsage[l.id] = 0;
    
      for (const tx of transactions) {
        if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
        if (locatorUsage[tx.locatorId] !== undefined) {
          const p = products.find(x => x.sku === tx.sku);
          if (p) {
            if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
              locatorUsage[tx.locatorId] += (tx.qty * p.volumeM3);
            } else if (tx.type === 'OUTBOUND' && (tx.status === 'CONFIRMED' || tx.status === 'BOOKED')) {
              locatorUsage[tx.locatorId] += (tx.qty * p.volumeM3);
            }
          }
        }
      }
    
      return candidates.filter(l => {
        const currentVol = locatorUsage[l.id] || 0;
        return (currentVol + requestedVol) <= l.maxVolumeM3;
      }).sort((a, b) => {
         if (a.rack.startsWith('FL') && !b.rack.startsWith('FL')) return 1;
         if (!a.rack.startsWith('FL') && b.rack.startsWith('FL')) return -1;
         return a.level - b.level;
       });
    };

    const preferredRacks = getAlowedRacksForCategory(product.category);
    const preferredLocators = locators.filter(l => preferredRacks.includes(l.rack));
    let availableLocators = getAvailable(preferredLocators);

    if (availableLocators.length === 0) {
      // Fallback to ALL floating buffer locators (FL), since they are generic now
      const floatingLocators = locators.filter(l => l.rack.startsWith('FL'));
      availableLocators = getAvailable(floatingLocators);
      
      if (availableLocators.length === 0) {
        // Fallback to ALL OTHER available non-default locators
        const otherLocators = locators.filter(l => !preferredRacks.includes(l.rack) && l.zone !== product.category && (l.zone as string) !== 'DEFAULT');
        availableLocators = getAvailable(otherLocators);
      }
    }
  
    return availableLocators.slice(0, 5);
}

export const seedDatabase = async () => {
    try {
        const companyId = getCurrentCompanyId();
        if (!companyId) {
            console.log("No active companyId, skipping seedDatabase.");
            return;
        }

        const locLocal = getFromLocal('local_locators_' + companyId);
        if (locLocal && locLocal.length > 0) {
            console.log("Local database already seeded, skipping seedDatabase.");
            return;
        }

        let lDocsSize = 0;
        try {
          const q = query(collection(db, 'locators'), where('companyId', '==', companyId));
          const lDocs = await getDocs(q);
          lDocsSize = lDocs.size;
        } catch (e) {
          console.warn("Firestore query failed during seed check, proceeding with local seed", e);
        }

        if (lDocsSize > 0) {
            console.log("Database already seeded on Firestore, skipping seedDatabase.");
            return;
        }

        const locators: Locator[] = [];
        const maxVolumeM3 = 5.4; 
        const warehouseId = getCurrentWarehouseId() || 'MAIN_WH';
      
        const racksConfig = [
          { rack: 'FL-A', prefix: ['FL-A'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-B', prefix: ['FL-B'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-C', prefix: ['FL-C'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-D', prefix: ['FL-D'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-E', prefix: ['FL-E'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-F', prefix: ['FL-F'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-G', prefix: ['FL-G'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-H', prefix: ['FL-H'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'FL-I', prefix: ['FL-I'], cols: 5, zone: 'DEFAULT' as ZoneCategory, levels: 2 },
          { rack: 'R1', prefix: ['A'], cols: 10, zone: 'FG_PLUMBING' as ZoneCategory, levels: 4 },
          { rack: 'R2', prefix: ['B'], cols: 9, zone: 'FG_SMART_WATER' as ZoneCategory, levels: 4 },
          { rack: 'R3', prefix: ['C', 'D'], cols: 9, zone: 'FG_FITTING' as ZoneCategory, levels: 4 },
          { rack: 'R4', prefix: ['E'], cols: 9, zone: 'FG_FILTER' as ZoneCategory, levels: 4 },
          { rack: 'R5', prefix: ['F'], cols: 9, zone: 'FG_FILTER' as ZoneCategory, levels: 4 },
          { rack: 'R6', prefix: ['G'], cols: 9, zone: 'PACKAGING_MATERIALS' as ZoneCategory, levels: 4 },
          { rack: 'R7', prefix: ['H'], cols: 9, zone: 'PACKAGING_MATERIALS' as ZoneCategory, levels: 4 },
          { rack: 'R8', prefix: ['I'], cols: 9, zone: 'ASSEMBLY_KIT' as ZoneCategory, levels: 4 },
        ];
      
        for (const rc of racksConfig) {
          for (const prefix of rc.prefix) {
            for (let c = 1; c <= rc.cols; c++) {
              for (let l = 1; l <= rc.levels; l++) {
                const colName = `${prefix}${c}`;
                locators.push({
                  id: `${colName}.${l}`,
                  rack: rc.rack,
                  column: colName,
                  level: l,
                  zone: rc.zone,
                  maxVolumeM3,
                  companyId,
                  warehouseId
                });
              }
            }
          }
        }
      
        const products: Product[] = [
          { sku: 'PB-PIPE-PVC', name: 'Plumbing PVC Pipe 4"', category: 'FG_PLUMBING', volumeM3: 0.5, uom: 'PCS', companyId, warehouseId },
          { sku: 'SW-SENS-01', name: 'Smart Flow Sensor', category: 'FG_SMART_WATER', volumeM3: 0.1, uom: 'PCS', companyId, warehouseId },
          { sku: 'FT-ELBOW-90', name: 'Brass Elbow 90', category: 'FG_FITTING', volumeM3: 0.2, uom: 'PCS', companyId, warehouseId },
          { sku: 'FL-CARBON', name: 'Carbon Filter Unit', category: 'FG_FILTER', volumeM3: 0.8, uom: 'SET', companyId, warehouseId },
          { sku: 'AK-MAN-01', name: 'Manufacture Kit 01', category: 'ASSEMBLY_KIT', volumeM3: 1.5, uom: 'BOX', companyId, warehouseId },
        ];
      
        const dummyTransactions: Transaction[] = [
          { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 8, locatorId: 'FL-A1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 10, locatorId: 'FL-A1.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 5, locatorId: 'FL-A2.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'SW-SENS-01', qty: 40, locatorId: 'FL-B1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'SW-SENS-01', qty: 25, locatorId: 'FL-B2.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'FT-ELBOW-90', qty: 20, locatorId: 'FL-C1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'FT-ELBOW-90', qty: 15, locatorId: 'FL-D1.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'FL-CARBON', qty: 6, locatorId: 'FL-E1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'AK-MAN-01', qty: 3, locatorId: 'FL-I1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 8, locatorId: 'A1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 10, locatorId: 'A1.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 5, locatorId: 'A2.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'SW-SENS-01', qty: 40, locatorId: 'B1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'SW-SENS-01', qty: 25, locatorId: 'B2.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'FT-ELBOW-90', qty: 20, locatorId: 'C1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          { id: uuidv4(), type: 'INBOUND', sku: 'FT-ELBOW-90', qty: 15, locatorId: 'D1.3', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'FL-CARBON', qty: 6, locatorId: 'E1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
          
          { id: uuidv4(), type: 'INBOUND', sku: 'AK-MAN-01', qty: 3, locatorId: 'I1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
        ];
        
        for (const tx of dummyTransactions) {
          tx.companyId = companyId;
          tx.warehouseId = warehouseId;
        }

        // Save to localStorage so it's instantly usable
        saveToLocal('local_locators_' + companyId, locators);
        saveToLocal('local_products_' + companyId, products);
        saveToLocal('local_transactions_' + companyId, dummyTransactions);

        try {
          const batch = writeBatch(db);
          for (const loc of locators) {
            batch.set(doc(db, 'locators', loc.id), loc);
          }
          for (const p of products) {
              batch.set(doc(db, 'products', getProductDocId(p.sku)), p);
          }
          for (const tx of dummyTransactions) {
              batch.set(doc(db, 'transactions', tx.id), tx);
          }
          await batch.commit();
        } catch (err) {
          console.warn("seedDatabase Firestore write failed, using local seed only", err);
        }

        clearCache();

    } catch (err) {
        console.error("Failed to seed db", err);
    }
};

export const savePhysicalStockCount = async (locatorId: string, sku: string, qty: number) => {
  const companyId = getCurrentCompanyId();
  const key = 'local_physical_counts_' + companyId;
  const docId = `${locatorId}_${sku}`;
  const localCounts = getFromLocal(key) || {};
  localCounts[docId] = qty;
  saveToLocal(key, localCounts);
  cache.physicalStockCounts = localCounts;

  try {
    await setDoc(doc(db, 'physical_stock_counts', docId), {
      companyId,
      locatorId,
      sku,
      qty,
      updatedAt: serverTimestamp()
    });
    clearCache('physicalStockCounts');
  } catch (err) {
    console.error("Error saving physical count:", err);
  }
};

export const getPhysicalStockCounts = async () => {
  checkCompanyChanged();
  if (cache.physicalStockCounts) return cache.physicalStockCounts;
  if (promises.physicalStockCounts) return promises.physicalStockCounts;

  promises.physicalStockCounts = (async () => {
    const companyId = getCurrentCompanyId();
    const key = 'local_physical_counts_' + companyId;
    try {
      const q = (!isGlobalDeveloper() && companyId) ? query(collection(db, 'physical_stock_counts'), where('companyId', '==', companyId)) : collection(db, 'physical_stock_counts');
      const snapshot = await getDocs(q as any);
      const counts: Record<string, number> = {};
      snapshot.forEach(doc => {
        const data = doc.data() as any;
        counts[doc.id] = data.qty;
      });
      saveToLocal(key, counts);
      cache.physicalStockCounts = counts;
      promises.physicalStockCounts = null;
      return counts;
    } catch (err) {
      console.error("Error getting physical counts:", err);
      const fallback = getFromLocal(key) || {};
      cache.physicalStockCounts = fallback;
      promises.physicalStockCounts = null;
      return fallback;
    }
  })();

  return promises.physicalStockCounts;
};

export const resetStockAndTransactions = async () => {
  const companyId = getCurrentCompanyId();
  if (!companyId) return;

  saveToLocal('local_products_' + companyId, []);
  saveToLocal('local_transactions_' + companyId, []);

  try {
    const collectionsToDelete = ['products', 'transactions'];
    for (const collName of collectionsToDelete) {
      const q = (!isGlobalDeveloper() && companyId) ? query(collection(db, collName), where('companyId', '==', companyId)) : collection(db, collName);
      const snapshot = await getDocs(q as any);
      let batch = writeBatch(db);
      let count = 0;
      
      for (const docSnap of snapshot.docs) {
        batch.delete(docSnap.ref);
        count++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    }
  } catch (err) {
    console.error("resetStockAndTransactions Firestore fail, using local clear", err);
  }
  clearCache();
};

