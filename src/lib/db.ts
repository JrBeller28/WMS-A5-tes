import { db } from '../firebase';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Locator, Product, Transaction, ZoneCategory } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const getProducts = async (): Promise<Product[]> => {
  const snapshot = await getDocs(collection(db, 'products'));
  const products: Product[] = [];
  snapshot.forEach(doc => {
    products.push(doc.data() as Product);
  });
  return products;
};

export const getLocators = async (): Promise<Locator[]> => {
  const snapshot = await getDocs(collection(db, 'locators'));
  const locators: Locator[] = [];
  snapshot.forEach(doc => {
    locators.push(doc.data() as Locator);
  });
  return locators;
};

export const addLocator = async (locator: Locator) => {
  await setDoc(doc(db, 'locators', locator.id), locator);
};

export const updateLocator = async (id: string, data: Partial<Locator>) => {
  await updateDoc(doc(db, 'locators', id), data as any);
};

export const deleteLocator = async (id: string) => {
  await deleteDoc(doc(db, 'locators', id));
};

export const addProduct = async (product: Product) => {
  await setDoc(doc(db, 'products', product.sku), product);
};

export const addProductWithStock = async (product: Product, qty: number, locatorId: string, operator: string) => {
  const batch = writeBatch(db);
  const productRef = doc(db, 'products', product.sku);
  batch.set(productRef, product);

  if (qty > 0 && locatorId) {
    const txId = uuidv4();
    const txRef = doc(db, 'transactions', txId);
    batch.set(txRef, {
      id: txId,
      type: 'INBOUND',
      sku: product.sku,
      qty: qty,
      locatorId: locatorId,
      operator: operator || 'System',
      timestamp: new Date().toISOString(),
      status: 'CONFIRMED',
      memo: 'Initial On-Hand Stock Setup'
    });
  }
  await batch.commit();
};

export const updateProduct = async (sku: string, data: Partial<Product>) => {
  await updateDoc(doc(db, 'products', sku), data as any);
};

export const deleteProduct = async (sku: string) => {
  await deleteDoc(doc(db, 'products', sku));
};

export const addProductsBatch = async (products: Product[]) => {
  const batch = writeBatch(db);
  for (const p of products) {
    const ref = doc(db, 'products', p.sku);
    batch.set(ref, p, { merge: true });
  }
  await batch.commit();
};

export const addProductsBatchWithStock = async (
  items: { product: Product; qty?: number; locatorId?: string }[],
  operator: string
) => {
  const batch = writeBatch(db);
  for (const item of items) {
    const productRef = doc(db, 'products', item.product.sku);
    batch.set(productRef, item.product, { merge: true });

    if (item.qty && item.qty > 0 && item.locatorId) {
      const txId = uuidv4();
      const txRef = doc(db, 'transactions', txId);
      batch.set(txRef, {
        id: txId,
        type: 'INBOUND',
        sku: item.product.sku,
        qty: item.qty,
        locatorId: item.locatorId,
        operator: operator || 'System',
        timestamp: new Date().toISOString(),
        status: 'CONFIRMED',
        memo: 'CSV Import Stock Setup'
      });
    }
  }
  await batch.commit();
};

export const getTransactions = async (): Promise<Transaction[]> => {
  const snapshot = await getDocs(collection(db, 'transactions'));
  const transactions: Transaction[] = [];
  snapshot.forEach(doc => {
    transactions.push(doc.data() as Transaction);
  });
  // Sort by timestamp desc
  return transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const addTransaction = async (tx: Transaction) => {
  await setDoc(doc(db, 'transactions', tx.id), tx);
};

export const updateTransactionStatus = async (id: string, status: Transaction['status']) => {
  await updateDoc(doc(db, 'transactions', id), { status });
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

export const getInventoryDetails = async () => {
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
  
    return inventory;
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
  const batch = writeBatch(db);
  const outTxId = uuidv4();
  const inTxId = uuidv4();

  batch.set(doc(db, 'transactions', outTxId), {
    id: outTxId,
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

    let preferredRacks: string[] = [];
    if (product.category === 'FG_PLUMBING') preferredRacks = ['R1'];
    else if (product.category === 'FG_SMART_WATER') preferredRacks = ['R2'];
    else if (product.category === 'FG_FITTING') preferredRacks = ['R3'];
    else if (product.category === 'FG_FILTER') preferredRacks = ['R4', 'R5'];
    else if (product.category === 'PACKAGING_MATERIALS') preferredRacks = ['R6', 'R7'];
    else if (product.category === 'ASSEMBLY_KIT') preferredRacks = ['R8'];

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
        const lDocs = await getDocs(collection(db, 'locators'));
        if (lDocs.size > 0 && lDocs.size < 400) {
            for (const doc of lDocs.docs) {
               await deleteDoc(doc.ref);
            }
        } else if (lDocs.size >= 400) {
            return;
        }

        const locators: Locator[] = [];
        const maxVolumeM3 = 5.4; 
      
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
                  maxVolumeM3
                });
              }
            }
          }
        }
      
        const products: Product[] = [
          { sku: 'PB-PIPE-PVC', name: 'Plumbing PVC Pipe 4"', category: 'FG_PLUMBING', volumeM3: 0.5, uom: 'PCS' },
          { sku: 'SW-SENS-01', name: 'Smart Flow Sensor', category: 'FG_SMART_WATER', volumeM3: 0.1, uom: 'PCS' },
          { sku: 'FT-ELBOW-90', name: 'Brass Elbow 90', category: 'FG_FITTING', volumeM3: 0.2, uom: 'PCS' },
          { sku: 'FL-CARBON', name: 'Carbon Filter Unit', category: 'FG_FILTER', volumeM3: 0.8, uom: 'SET' },
          { sku: 'AK-MAN-01', name: 'Manufacture Kit 01', category: 'ASSEMBLY_KIT', volumeM3: 1.5, uom: 'BOX' },
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
        
        const batch = writeBatch(db);
        
        for (const loc of locators) {
          batch.set(doc(db, 'locators', loc.id), loc);
        }
        for (const p of products) {
            batch.set(doc(db, 'products', p.sku), p);
        }
        for (const tx of dummyTransactions) {
            batch.set(doc(db, 'transactions', tx.id), tx);
        }

        await batch.commit();

    } catch (err) {
        console.error("Failed to seed db", err);
    }
}
