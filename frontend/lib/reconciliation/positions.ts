/**
 * Position Management
 * 
 * A Position represents a grouping of related transactions for a single DeFi position.
 * Examples: Uniswap V3 LP position, GMX perpetual, Aave lending position
 * 
 * Positions can be:
 * - Auto-detected from transaction data (project_id, position metadata)
 * - Manually created by the user
 * - Linked to Strategies for portfolio analysis
 */

import { getTxKey, type ReconciliationStore } from './storage';
import type { Transaction } from '@/lib/api';

// Position status based on transaction history
export type PositionStatus = 'open' | 'closed' | 'partial';

// Position interface
export interface Position {
  id: string;                    // Unique ID (uuid or auto-generated)
  name: string;                  // Display name (e.g., "ETH/USDC LP #12345")
  
  // Protocol info
  chain: string;                 // Primary chain (eth, arb, etc.)
  protocol: string;              // Protocol ID (uniswap3, arb_gmx2, etc.)
  protocolName?: string;         // Human readable name
  
  // Position identifiers (for auto-grouping)
  positionKey?: string;          // External position ID (NFT ID, etc.)
  tokenPair?: string;            // e.g., "ETH/USDC"
  
  // Linked transactions
  txKeys: string[];              // Array of `${chain}:${txHash}` keys
  
  // Status
  status: PositionStatus;
  
  // Strategy link (optional)
  strategyId?: string;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  notes?: string;
}


// Extended store with positions
export interface PositionStore {
  positions: Record<string, Position>;  // positionId -> Position
}

// Generate unique position ID
export function generatePositionId(): string {
  return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate position name from transactions
export function generatePositionName(
  protocol: string,
  protocolName: string | undefined,
  tokenPair: string | undefined,
  positionKey: string | undefined
): string {
  const protoDisplay = protocolName || protocol;
  
  if (tokenPair && positionKey) {
    return `${protoDisplay} ${tokenPair} #${positionKey.slice(-6)}`;
  } else if (tokenPair) {
    return `${protoDisplay} ${tokenPair}`;
  } else if (positionKey) {
    return `${protoDisplay} Position #${positionKey.slice(-6)}`;
  } else {
    return `${protoDisplay} Position`;
  }
}

// Position type for better categorization
export type PositionType = 'lp' | 'perpetual' | 'lending' | 'staking' | 'bridge' | 'swap' | 'unknown';

// Extract position info from a transaction
export function extractPositionInfo(tx: Transaction, tokenDict?: Record<string, { symbol?: string }>): {
  chain: string;
  protocol: string;
  positionKey?: string;
  tokenPair?: string;
  positionType: PositionType;
} {
  const chain = tx.chain || 'unknown';
  const protocol = tx.project_id || 'unknown';
  const cateId = tx.cate_id || '';
  const txName = tx.tx?.name || '';
  
  let positionKey: string | undefined;
  let tokenPair: string | undefined;
  let positionType: PositionType = 'unknown';
  
  // Detect position type from protocol and transaction category
  if (protocol.includes('gmx')) {
    positionType = 'perpetual';
  } else if (protocol.includes('uniswap') || protocol.includes('pancake') || protocol.includes('sushi')) {
    positionType = 'lp';
  } else if (protocol.includes('aave') || protocol.includes('compound') || protocol.includes('morpho')) {
    positionType = 'lending';
  } else if (protocol.includes('lido') || protocol.includes('rocket') || protocol.includes('eigen')) {
    positionType = 'staking';
  } else if (protocol.includes('bridge') || protocol.includes('socket') || protocol.includes('across')) {
    positionType = 'bridge';
  } else if (cateId === 'swap' || txName.includes('swap')) {
    positionType = 'swap';
  } else if (cateId.includes('liquidity') || txName.includes('Liquidity')) {
    positionType = 'lp';
  }
  
  // Check for NFT position (Uniswap V3 style)
  if (tx.receives) {
    for (const recv of tx.receives) {
      if (recv.token_id?.includes('nft')) {
        positionKey = recv.token_id;
        break;
      }
    }
  }
  
  // Extract token pair from sends/receives using tokenDict for proper symbols
  const tokens = new Set<string>();
  for (const send of tx.sends || []) {
    if (send.token_id) {
      const tokenInfo = tokenDict?.[send.token_id];
      const symbol = tokenInfo?.symbol || send.token_id.split(':').pop()?.toUpperCase() || '???';
      // Skip spam tokens and very long symbols
      if (symbol.length <= 10 && !symbol.includes('.com') && !symbol.includes('x.com')) {
        tokens.add(symbol);
      }
    }
  }
  for (const recv of tx.receives || []) {
    if (recv.token_id && !recv.token_id.includes('nft')) {
      const tokenInfo = tokenDict?.[recv.token_id];
      const symbol = tokenInfo?.symbol || recv.token_id.split(':').pop()?.toUpperCase() || '???';
      if (symbol.length <= 10 && !symbol.includes('.com') && !symbol.includes('x.com')) {
        tokens.add(symbol);
      }
    }
  }
  
  if (tokens.size === 2) {
    tokenPair = Array.from(tokens).sort().join('/');
  } else if (tokens.size === 1) {
    tokenPair = Array.from(tokens)[0];
  }
  
  return { chain, protocol, positionKey, tokenPair, positionType };
}


// ==================== CRUD Operations ====================

// Create a new position
export function createPosition(
  store: ReconciliationStore & PositionStore,
  params: {
    name?: string;
    chain: string;
    protocol: string;
    protocolName?: string;
    positionKey?: string;
    tokenPair?: string;
    txKeys?: string[];
    notes?: string;
  }
): { store: ReconciliationStore & PositionStore; position: Position } {
  const id = generatePositionId();
  const now = Date.now();
  
  const position: Position = {
    id,
    name: params.name || generatePositionName(
      params.protocol,
      params.protocolName,
      params.tokenPair,
      params.positionKey
    ),
    chain: params.chain,
    protocol: params.protocol,
    protocolName: params.protocolName,
    positionKey: params.positionKey,
    tokenPair: params.tokenPair,
    txKeys: params.txKeys || [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
    notes: params.notes,
  };
  
  // Update transaction overlays with position link
  const updatedTransactions = { ...store.transactions };
  for (const txKey of position.txKeys) {
    updatedTransactions[txKey] = {
      ...updatedTransactions[txKey],
      txKey,
      hidden: updatedTransactions[txKey]?.hidden || false,
      positionId: id,
    };
  }
  
  return {
    store: {
      ...store,
      transactions: updatedTransactions,
      positions: {
        ...store.positions,
        [id]: position,
      },
    },
    position,
  };
}

// Update a position
export function updatePosition(
  store: ReconciliationStore & PositionStore,
  positionId: string,
  updates: Partial<Pick<Position, 'name' | 'status' | 'strategyId' | 'notes'>>
): ReconciliationStore & PositionStore {
  const position = store.positions[positionId];
  if (!position) return store;
  
  return {
    ...store,
    positions: {
      ...store.positions,
      [positionId]: {
        ...position,
        ...updates,
        updatedAt: Date.now(),
      },
    },
  };
}

// Delete a position (unlinks transactions and removes from strategies)
export function deletePosition(
  store: ReconciliationStore & PositionStore,
  positionId: string
): ReconciliationStore & PositionStore {
  const position = store.positions[positionId];
  if (!position) return store;
  
  // Remove position link from transactions
  const updatedTransactions = { ...store.transactions };
  for (const txKey of position.txKeys) {
    if (updatedTransactions[txKey]) {
      const { positionId: _, ...rest } = updatedTransactions[txKey] as any;
      updatedTransactions[txKey] = rest;
    }
  }
  
  // Remove position from any strategies that reference it
  const strategies = (store as any).strategies as Record<string, any> | undefined;
  let updatedStrategies = strategies;
  
  if (strategies) {
    updatedStrategies = { ...strategies };
    for (const [stratId, strategy] of Object.entries(updatedStrategies)) {
      if (strategy.positions?.some((p: any) => p.positionId === positionId)) {
        updatedStrategies[stratId] = {
          ...strategy,
          positions: strategy.positions.filter((p: any) => p.positionId !== positionId),
          updatedAt: Date.now(),
        };
      }
    }
  }
  
  // Remove position
  const { [positionId]: _, ...remainingPositions } = store.positions;
  
  return {
    ...store,
    transactions: updatedTransactions,
    positions: remainingPositions,
    ...(updatedStrategies ? { strategies: updatedStrategies } : {}),
  };
}


// Add transactions to a position
export function addTransactionsToPosition(
  store: ReconciliationStore & PositionStore,
  positionId: string,
  txKeys: string[]
): ReconciliationStore & PositionStore {
  const position = store.positions[positionId];
  if (!position) return store;
  
  // Update transaction overlays
  const updatedTransactions = { ...store.transactions };
  for (const txKey of txKeys) {
    updatedTransactions[txKey] = {
      ...updatedTransactions[txKey],
      txKey,
      hidden: updatedTransactions[txKey]?.hidden || false,
      positionId,
    };
  }
  
  // Update position
  const newTxKeys = [...new Set([...position.txKeys, ...txKeys])];
  
  return {
    ...store,
    transactions: updatedTransactions,
    positions: {
      ...store.positions,
      [positionId]: {
        ...position,
        txKeys: newTxKeys,
        updatedAt: Date.now(),
      },
    },
  };
}

// Remove transactions from a position
export function removeTransactionsFromPosition(
  store: ReconciliationStore & PositionStore,
  positionId: string,
  txKeys: string[]
): ReconciliationStore & PositionStore {
  const position = store.positions[positionId];
  if (!position) return store;
  
  // Remove position link from transactions
  const updatedTransactions = { ...store.transactions };
  for (const txKey of txKeys) {
    if (updatedTransactions[txKey]) {
      const { positionId: _, ...rest } = updatedTransactions[txKey] as any;
      updatedTransactions[txKey] = rest;
    }
  }
  
  // Update position
  const txKeySet = new Set(txKeys);
  const newTxKeys = position.txKeys.filter(k => !txKeySet.has(k));
  
  return {
    ...store,
    transactions: updatedTransactions,
    positions: {
      ...store.positions,
      [positionId]: {
        ...position,
        txKeys: newTxKeys,
        updatedAt: Date.now(),
      },
    },
  };
}


// ==================== Auto-Grouping ====================

// Suggested position grouping
export interface PositionSuggestion {
  key: string;                   // Grouping key (protocol:chain:positionKey or protocol:chain:tokenPair)
  chain: string;
  protocol: string;
  protocolName?: string;
  positionKey?: string;
  tokenPair?: string;
  positionType: PositionType;
  txKeys: string[];
  transactionCount: number;
  confidence: 'high' | 'medium' | 'low';
}

// Generate position suggestions from transactions
export function suggestPositions(
  transactions: Transaction[],
  store: ReconciliationStore & PositionStore,
  projectDict: Record<string, { name: string }> = {},
  tokenDict: Record<string, { symbol?: string }> = {}
): PositionSuggestion[] {
  // Group transactions by position characteristics
  const groups = new Map<string, {
    chain: string;
    protocol: string;
    protocolName?: string;
    positionKey?: string;
    tokenPair?: string;
    positionType: PositionType;
    txKeys: string[];
  }>();
  
  for (const tx of transactions) {
    const txKey = getTxKey(tx.chain, tx.id);
    
    // Skip if already assigned to a position
    const overlay = store.transactions[txKey];
    if (overlay?.positionId) continue;
    
    // Skip hidden transactions
    if (overlay?.hidden) continue;
    
    // Skip approve transactions (they should be bundled with their action)
    if (tx.cate_id === 'approve') continue;
    
    // Skip deploy transactions (usually spam)
    if (tx.cate_id === 'deploy') continue;
    
    // Extract position info with tokenDict for better symbol resolution
    const info = extractPositionInfo(tx, tokenDict);
    const protocolName = projectDict[info.protocol]?.name;
    
    // Create grouping key - prioritize positionKey for high confidence
    let groupKey: string;
    let confidence: 'high' | 'medium' | 'low';
    
    if (info.positionKey) {
      groupKey = `${info.protocol}:${info.chain}:pos:${info.positionKey}`;
      confidence = 'high';
    } else if (info.tokenPair && info.protocol !== 'unknown') {
      groupKey = `${info.protocol}:${info.chain}:${info.positionType}:${info.tokenPair}`;
      confidence = 'medium';
    } else if (info.protocol !== 'unknown') {
      groupKey = `${info.protocol}:${info.chain}:${info.positionType}`;
      confidence = 'low';
    } else {
      continue; // Skip ungroupable transactions
    }
    
    // Add to group
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        chain: info.chain,
        protocol: info.protocol,
        protocolName,
        positionKey: info.positionKey,
        tokenPair: info.tokenPair,
        positionType: info.positionType,
        txKeys: [],
      });
    }
    
    groups.get(groupKey)!.txKeys.push(txKey);
  }
  
  // Convert to suggestions array
  const suggestions: PositionSuggestion[] = [];
  
  for (const [key, group] of groups) {
    // Only suggest groups with 2+ transactions
    if (group.txKeys.length < 2) continue;
    
    const confidence = key.includes(':pos:') ? 'high' 
      : group.tokenPair ? 'medium' 
      : 'low';
    
    suggestions.push({
      key,
      chain: group.chain,
      protocol: group.protocol,
      protocolName: group.protocolName,
      positionKey: group.positionKey,
      tokenPair: group.tokenPair,
      positionType: group.positionType,
      txKeys: group.txKeys,
      transactionCount: group.txKeys.length,
      confidence,
    });
  }
  
  // Sort by confidence, then position type priority, then transaction count
  const typeOrder: Record<PositionType, number> = {
    lp: 0,
    perpetual: 1,
    lending: 2,
    staking: 3,
    bridge: 4,
    swap: 5,
    unknown: 6,
  };
  
  suggestions.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence];
    }
    if (typeOrder[a.positionType] !== typeOrder[b.positionType]) {
      return typeOrder[a.positionType] - typeOrder[b.positionType];
    }
    return b.transactionCount - a.transactionCount;
  });
  
  return suggestions;
}


// ==================== Helper Functions ====================

// Get all positions for a wallet
export function getPositions(store: PositionStore): Position[] {
  return Object.values(store.positions || {});
}

// Get position by ID
export function getPosition(store: PositionStore, positionId: string): Position | null {
  return store.positions?.[positionId] || null;
}

// Get position for a transaction
export function getPositionForTransaction(
  store: ReconciliationStore & PositionStore,
  txKey: string
): Position | null {
  const overlay = store.transactions[txKey];
  if (!overlay?.positionId) return null;
  return store.positions?.[overlay.positionId] || null;
}

// Get unassigned transaction count
export function getUnassignedTransactionCount(
  transactions: Transaction[],
  store: ReconciliationStore & PositionStore
): number {
  let count = 0;
  for (const tx of transactions) {
    const txKey = getTxKey(tx.chain, tx.id);
    const overlay = store.transactions[txKey];
    if (!overlay?.hidden && !overlay?.positionId) {
      count++;
    }
  }
  return count;
}

// Ensure store has positions field
export function ensurePositionStore(
  store: ReconciliationStore
): ReconciliationStore & PositionStore {
  return {
    ...store,
    positions: (store as any).positions || {},
  };
}

// Calculate position status from transactions
export function calculatePositionStatus(
  position: Position,
  transactions: Transaction[]
): PositionStatus {
  // Build map of transactions by key
  const txMap = new Map(
    transactions.map(tx => [getTxKey(tx.chain, tx.id), tx])
  );
  
  // Analyze position transactions
  let hasAdd = false;
  let hasRemove = false;
  
  for (const txKey of position.txKeys) {
    const tx = txMap.get(txKey);
    if (!tx) continue;
    
    const cateName = tx.cate_id || '';
    
    // Detect adds (mint, deposit, add liquidity)
    if (cateName.includes('add') || cateName.includes('mint') || cateName.includes('deposit')) {
      hasAdd = true;
    }
    
    // Detect removes (burn, withdraw, remove liquidity)
    if (cateName.includes('remove') || cateName.includes('burn') || cateName.includes('withdraw')) {
      hasRemove = true;
    }
  }
  
  if (hasAdd && hasRemove) {
    return 'partial'; // Position has been modified
  } else if (hasRemove && !hasAdd) {
    return 'closed'; // Only removals, likely closed
  } else {
    return 'open'; // Default to open
  }
}
