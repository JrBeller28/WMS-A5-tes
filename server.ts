import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { createServer as createViteServer } from 'vite';
import { Locator, Product, Transaction, ZoneCategory } from './src/types.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Simple In-Memory Database Backed by JSON File
const DB_FILE = path.join(process.cwd(), 'database.json');

interface Database {
  locators: Locator[];
  products: Product[];
  transactions: Transaction[];
}

let db: Database = { locators: [], products: [], transactions: [] };

async function initDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    db = JSON.parse(data);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log('No database file found. Initializing Master Data...');
      generateMasterData();
      await saveDB();
    } else {
      console.error('Error reading DB:', err);
    }
  }
}

async function saveDB() {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function generateMasterData() {
  const locators: Locator[] = [];
  const maxVolumeM3 = 5.4; // 2 Pallets * 2.7 m3

  const racksConfig = [
    { rack: 'R1', prefix: ['A'], cols: 10, zone: 'FG_PLUMBING' as ZoneCategory },
    { rack: 'R2', prefix: ['B'], cols: 9, zone: 'FG_SMART_WATER' as ZoneCategory },
    { rack: 'R3', prefix: ['C', 'D'], cols: 9, zone: 'FG_FITTING' as ZoneCategory },
    { rack: 'R4', prefix: ['E'], cols: 9, zone: 'FG_FITTING' as ZoneCategory },
    { rack: 'R5', prefix: ['F'], cols: 9, zone: 'FG_FILTER' as ZoneCategory },
    { rack: 'R6', prefix: ['G'], cols: 9, zone: 'FG_FILTER' as ZoneCategory },
    { rack: 'R7', prefix: ['H'], cols: 9, zone: 'ASSEMBLY_KIT' as ZoneCategory },
    { rack: 'R8', prefix: ['I'], cols: 9, zone: 'ASSEMBLY_KIT' as ZoneCategory },
  ];

  for (const rc of racksConfig) {
    for (const prefix of rc.prefix) {
      for (let c = 1; c <= rc.cols; c++) {
        for (let l = 1; l <= 4; l++) {
          const colName = `${prefix}${c}`;
          locators.push({
            id: `${rc.rack}-${colName}.${l}`,
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
    { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 8, locatorId: 'R1-A1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 10, locatorId: 'R1-A1.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    { id: uuidv4(), type: 'INBOUND', sku: 'PB-PIPE-PVC', qty: 5, locatorId: 'R1-A2.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    
    { id: uuidv4(), type: 'INBOUND', sku: 'SW-SENS-01', qty: 40, locatorId: 'R2-B1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    { id: uuidv4(), type: 'INBOUND', sku: 'SW-SENS-01', qty: 25, locatorId: 'R2-B2.2', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    
    { id: uuidv4(), type: 'INBOUND', sku: 'FT-ELBOW-90', qty: 20, locatorId: 'R3-C1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    { id: uuidv4(), type: 'INBOUND', sku: 'FT-ELBOW-90', qty: 15, locatorId: 'R4-E1.3', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    
    { id: uuidv4(), type: 'INBOUND', sku: 'FL-CARBON', qty: 6, locatorId: 'R5-F1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
    
    { id: uuidv4(), type: 'INBOUND', sku: 'AK-MAN-01', qty: 3, locatorId: 'R7-H1.1', operator: 'System', timestamp: new Date().toISOString(), status: 'CONFIRMED' },
  ];

  db = { locators, products, transactions: dummyTransactions };
}

// --- API ROUTES ---

// GET /api/inventory
// Calculates total available stock per SKU, and details per locator
app.get('/api/inventory', (req, res) => {
  const inventory: Record<string, {
    totalAvailableQty: number; 
    totalPhysicalQty: number;
    locators: Record<string, { availableQty: number; physicalQty: number }> 
  }> = {};
  
  for (const tx of db.transactions) {
    if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
    
    if (!inventory[tx.sku]) {
      inventory[tx.sku] = { totalAvailableQty: 0, totalPhysicalQty: 0, locators: {} };
    }
    if (!inventory[tx.sku].locators[tx.locatorId]) {
      inventory[tx.sku].locators[tx.locatorId] = { availableQty: 0, physicalQty: 0 };
    }

    let availableChange = tx.qty; // INBOUND is positive, OUTBOUND is negative
    let physicalChange = 0;

    if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
      physicalChange = tx.qty;
    } else if (tx.type === 'OUTBOUND') {
      if (tx.status === 'CONFIRMED') {
        physicalChange = tx.qty; // which is negative
      } else if (tx.status === 'BOOKED') {
        physicalChange = 0; // still physically in the warehouse
      }
    }

    inventory[tx.sku].totalAvailableQty += availableChange;
    inventory[tx.sku].totalPhysicalQty += physicalChange;
    
    inventory[tx.sku].locators[tx.locatorId].availableQty += availableChange;
    inventory[tx.sku].locators[tx.locatorId].physicalQty += physicalChange;
  }

  res.json(inventory);
});

// GET /api/master/products
app.get('/api/master/products', (req, res) => {
  res.json(db.products);
});

// GET /api/master/locators
app.get('/api/master/locators', (req, res) => {
  res.json(db.locators);
});

// POST /api/putaway/recommend
// Suggests an empty rack based on Zone
app.post('/api/putaway/recommend', (req, res) => {
  const { sku, qty } = req.body;
  const product = db.products.find(p => p.sku === sku);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const requestedVol = product.volumeM3 * qty;

  // Find locators assigned to the product's zone
  const zoneLocators = db.locators.filter(l => l.zone === product.category);

  // Calculate current volume usage for all locators
  const locatorUsage: Record<string, number> = {};
  for (const l of zoneLocators) locatorUsage[l.id] = 0;

  for (const tx of db.transactions) {
    if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
    if (locatorUsage[tx.locatorId] !== undefined) {
      const p = db.products.find(x => x.sku === tx.sku);
      if (p) {
        if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
          locatorUsage[tx.locatorId] += (tx.qty * p.volumeM3);
        } else if (tx.type === 'OUTBOUND' && tx.status === 'CONFIRMED') {
          locatorUsage[tx.locatorId] += (tx.qty * p.volumeM3);
        }
      }
    }
  }

  // Find locators with enough space
  const availableLocators = zoneLocators.filter(l => {
    const currentVol = locatorUsage[l.id] || 0;
    return (currentVol + requestedVol) <= l.maxVolumeM3;
  }).sort((a, b) => {
    // simple sort: prefer empty lower levels first
    return a.level - b.level;
  });

  res.json({ recommendedLocators: availableLocators.slice(0, 5) });
});

// POST /api/inbound
app.post('/api/inbound', async (req, res) => {
  const { sku, qty, locatorId, operator } = req.body;
  
  const product = db.products.find(p => p.sku === sku);
  const locator = db.locators.find(l => l.id === locatorId);
  
  if (!product || !locator) {
    return res.status(400).json({ error: 'Invalid SKU or Locator' });
  }

  const tx: Transaction = {
    id: uuidv4(),
    type: 'INBOUND',
    sku,
    qty: Math.abs(qty),
    locatorId,
    operator,
    timestamp: new Date().toISOString(),
    status: 'CONFIRMED'
  };

  db.transactions.push(tx);
  await saveDB();

  res.json({ success: true, transaction: tx });
});

// GET /api/outbound/options
// Get all locators having stock for an SKU
app.get('/api/outbound/options', (req, res) => {
  const { sku } = req.query;
  if (!sku || typeof sku !== 'string') return res.status(400).json({ error: 'Missing SKU' });

  const locatorStock: Record<string, number> = {};
  
  for (const tx of db.transactions) {
    if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
    if (tx.sku === sku) {
      if (!locatorStock[tx.locatorId]) locatorStock[tx.locatorId] = 0;
      locatorStock[tx.locatorId] += tx.qty;
    }
  }

  // Filter locators with > 0 stock
  const available = Object.entries(locatorStock)
    .filter(([_, qty]) => qty > 0)
    .map(([locId, qty]) => ({ locatorId: locId, qty }));

  res.json({ available });
});

// POST /api/outbound/book
// FIFO Picking - Booking transaction
app.post('/api/outbound/book', async (req, res) => {
  const { sku, qty, locatorId, operator, memo } = req.body;

  // Check stock validation
  const locatorStock: Record<string, number> = {};
  for (const tx of db.transactions) {
    if (tx.status === 'CANCELLED' || tx.status === 'PENDING') continue;
    if (tx.sku === sku) {
      if (!locatorStock[tx.locatorId]) locatorStock[tx.locatorId] = 0;
      locatorStock[tx.locatorId] += tx.qty;
    }
  }

  const pickVal = Math.abs(qty);
  const available = locatorStock[locatorId] || 0;
  if (pickVal > available) {
    return res.status(400).json({ 
      error: `Insufficient stock in ${locatorId}. Available: ${available}, Requested: ${pickVal}. Please adjust the quantity or pick from another rack.` 
    });
  }

  const tx: Transaction = {
    id: uuidv4(),
    type: 'OUTBOUND',
    sku,
    qty: -pickVal, // Negative for outbound
    locatorId,
    operator,
    timestamp: new Date().toISOString(),
    status: 'BOOKED',
    memo
  };

  db.transactions.push(tx);
  await saveDB();

  res.json({ success: true, transaction: tx });
});

// POST /api/outbound/confirm
app.post('/api/outbound/confirm', async (req, res) => {
  const { transactionId } = req.body;
  const tx = db.transactions.find(t => t.id === transactionId);
  if (!tx || tx.type !== 'OUTBOUND') {
    return res.status(400).json({ error: 'Invalid transaction' });
  }

  tx.status = 'CONFIRMED';
  await saveDB();
  res.json({ success: true, transaction: tx });
});

// GET /api/ledger
app.get('/api/ledger', (req, res) => {
  // Return last 50 transactions
  const sorted = [...db.transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(sorted.slice(0, 50));
});

// --- PRODUCT CRUD ENDPOINTS ---

app.post('/api/master/products', async (req, res) => {
  const product = req.body;
  if (!product.sku || !product.name || !product.category || !product.volumeM3 || !product.uom) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (db.products.find(p => p.sku === product.sku)) {
    return res.status(400).json({ error: 'SKU already exists' });
  }
  db.products.push(product);
  await saveDB();
  res.json({ success: true, product });
});

app.put('/api/master/products/:sku', async (req, res) => {
  const { sku } = req.params;
  const index = db.products.findIndex(p => p.sku === sku);
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }
  db.products[index] = { ...db.products[index], ...req.body, sku };
  await saveDB();
  res.json({ success: true, product: db.products[index] });
});

app.delete('/api/master/products/:sku', async (req, res) => {
  const { sku } = req.params;
  const index = db.products.findIndex(p => p.sku === sku);
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  // Check if product has transactions
  const hasTransactions = db.transactions.some(tx => tx.sku === sku);
  if (hasTransactions) {
    return res.status(400).json({ error: 'Cannot delete product with existing transactions' });
  }

  db.products.splice(index, 1);
  await saveDB();
  res.json({ success: true });
});

app.post('/api/master/products/batch', async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  
  let added = 0;
  let skipped = 0;
  for (const p of products) {
    if (!db.products.find(existing => existing.sku === p.sku)) {
      if (p.sku && p.name && p.category && p.volumeM3 && p.uom) {
        db.products.push({
          sku: p.sku,
          name: p.name,
          category: p.category,
          volumeM3: Number(p.volumeM3) || 1,
          uom: p.uom
        });
        added++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }
  await saveDB();
  res.json({ success: true, added, skipped });
});

// Add Vite middleware for development
async function startServer() {
  await initDB();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
