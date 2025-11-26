/**
 * Reconciliation Storage
 * 
 * Stores user reconciliation data as an overlay on top of raw DeBank transactions.
 * Uses localStorage for MVP, can migrate to backend database later.
 * 
 * Key format: `${chain}:${txHash}` for uniqueness
 */

const STORAGE_KEY_PREFIX = 'vora_reconciliation_v1_';

// Transaction overlay data (stored separately from raw transactions)
export interface TransactionOverlay {
  txKey: string;              // `${chain}:${txHash}`
  hidden: boolean;
  hiddenAt?: number;          // Timestamp when hidden
  hiddenReason?: 'scam' | 'irrelevant' | 'approval' | 'dust' | 'other';
  // Future fields for reconciliation:
  // positionId?: string;
  // strategyId?: string;
  // allocations?: Allocation[];
}

export interface ReconciliationStore {
  version: string;
  walletAddress: string;
  lastUpdated: number;
  transactions: Record<string, TransactionOverlay>;  // txKey -> overlay
}

// Generate unique key for a transaction
export function getTxKey(chain: string, txHash: string): string {
  return `${chain}:${txHash}`;
}

// Get storage key for a wallet
function getStorageKey(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
}

// Load reconciliation store for a wallet
export function loadReconciliationStore(walletAddress: string): ReconciliationStore {
  if (typeof window === 'undefined') {
    return createEmptyStore(walletAddress);
  }
  
  const key = getStorageKey(walletAddress);
  const stored = localStorage.getItem(key);
  
  if (!stored) {
    return createEmptyStore(walletAddress);
  }
  
  try {
    const parsed = JSON.parse(stored) as ReconciliationStore;
    // Validate it's for the right wallet
    if (parsed.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
      return createEmptyStore(walletAddress);
    }
    return parsed;
  } catch {
    return createEmptyStore(walletAddress);
  }
}

// Save reconciliation store for a wallet
export function saveReconciliationStore(store: ReconciliationStore): void {
  if (typeof window === 'undefined') return;
  
  const key = getStorageKey(store.walletAddress);
  store.lastUpdated = Date.now();
  localStorage.setItem(key, JSON.stringify(store));
}

// Create empty store
function createEmptyStore(walletAddress: string): ReconciliationStore {
  return {
    version: '1.0',
    walletAddress: walletAddress.toLowerCase(),
    lastUpdated: Date.now(),
    transactions: {}
  };
}

// Get overlay for a specific transaction
export function getTransactionOverlay(
  store: ReconciliationStore, 
  chain: string, 
  txHash: string
): TransactionOverlay | null {
  const txKey = getTxKey(chain, txHash);
  return store.transactions[txKey] || null;
}

// Hide a transaction
export function hideTransaction(
  store: ReconciliationStore,
  chain: string,
  txHash: string,
  reason?: TransactionOverlay['hiddenReason']
): ReconciliationStore {
  const txKey = getTxKey(chain, txHash);
  
  const overlay = store.transactions[txKey] || { txKey, hidden: false };
  overlay.hidden = true;
  overlay.hiddenAt = Date.now();
  if (reason) overlay.hiddenReason = reason;
  
  return {
    ...store,
    transactions: {
      ...store.transactions,
      [txKey]: overlay
    }
  };
}

// Unhide a transaction
export function unhideTransaction(
  store: ReconciliationStore,
  chain: string,
  txHash: string
): ReconciliationStore {
  const txKey = getTxKey(chain, txHash);
  
  const overlay = store.transactions[txKey];
  if (!overlay) return store;
  
  overlay.hidden = false;
  delete overlay.hiddenAt;
  delete overlay.hiddenReason;
  
  return {
    ...store,
    transactions: {
      ...store.transactions,
      [txKey]: overlay
    }
  };
}

// Check if transaction is hidden
export function isTransactionHidden(
  store: ReconciliationStore,
  chain: string,
  txHash: string
): boolean {
  const txKey = getTxKey(chain, txHash);
  return store.transactions[txKey]?.hidden || false;
}

// Get count of hidden transactions
export function getHiddenCount(store: ReconciliationStore): number {
  return Object.values(store.transactions).filter(t => t.hidden).length;
}

// Get all hidden transaction keys
export function getHiddenTxKeys(store: ReconciliationStore): string[] {
  return Object.entries(store.transactions)
    .filter(([_, overlay]) => overlay.hidden)
    .map(([key, _]) => key);
}
