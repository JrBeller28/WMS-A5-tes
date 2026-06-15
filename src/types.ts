export type ZoneCategory = 
  | 'FG_PLUMBING'
  | 'FG_SMART_WATER'
  | 'FG_FITTING'
  | 'FG_FILTER'
  | 'PACKAGING_MATERIALS'
  | 'ASSEMBLY_KIT'
  | 'SPECIFIC_AREA'
  | 'RAW_MATERIALS'
  | 'DEFAULT';

export interface Product {
  sku: string;
  name: string;
  category: ZoneCategory;
  volumeM3: number; // Volume per unit in M3
  uom: string;
}

export interface Locator {
  id: string; // e.g. "R1-A1.1" (Rack R1, Column A1, Level 1)
  rack: string; // R1
  column: string; // A1
  level: number; // 1
  zone: ZoneCategory;
  maxVolumeM3: number; // usually 5.4
}

export type TransactionType = 'INBOUND' | 'OUTBOUND' | 'TRANSFER';
export type TransactionStatus = 'PENDING' | 'BOOKED' | 'CONFIRMED' | 'CANCELLED';

export interface Transaction {
  id: string;
  type: TransactionType;
  sku: string;
  qty: number; // positive for INBOUND, negative for OUTBOUND/BOOKED physical
  locatorId: string;
  operator: string;
  timestamp: string;
  status: TransactionStatus;
  memo?: string;
}

export interface InventoryItem {
  sku: string;
  locatorId: string;
  qty: number;
}
