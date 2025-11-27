/**
 * Strategy Management
 * 
 * A Strategy is a higher-level grouping of Positions that work together
 * toward a common goal (e.g., delta-neutral hedging, yield farming).
 * 
 * Examples:
 * - "Delta Neutral ETH" strategy containing ETH/USDC LP + short ETH perp
 * - "Stablecoin Yield" strategy containing multiple stablecoin LPs
 * - "BTC Accumulation" strategy with BTC LPs and long positions
 */

import { type Position } from './positions';
import { type ReconciliationStore } from './storage';

// Strategy status derived from positions
export type StrategyStatus = 'active' | 'closed' | 'partial';

// Allocation of a position within a strategy
export interface PositionAllocation {
  positionId: string;
  percentage: number;        // 0-100, how much of position is in this strategy
  addedAt: number;           // Timestamp when added
}

// Strategy interface
export interface Strategy {
  id: string;                       // Unique ID
  name: string;                     // Display name (e.g., "Delta Neutral ETH")
  description?: string;             // Optional description
  
  // Strategy type
  type: 'delta_neutral' | 'yield' | 'directional' | 'arbitrage' | 'custom';
  
  // Linked positions with allocations
  positions: PositionAllocation[];
  
  // Target allocation (optional)
  targetAllocation?: {
    longPercentage: number;         // Target % long exposure
    shortPercentage: number;        // Target % short exposure
  };
  
  // Status
  status: StrategyStatus;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  notes?: string;
  
  // Tags for filtering
  tags?: string[];
}


// Strategy types for UI
export const STRATEGY_TYPES = [
  { value: 'delta_neutral', label: 'Delta Neutral', description: 'Hedge directional exposure' },
  { value: 'yield', label: 'Yield Farming', description: 'Earn yield from liquidity provision' },
  { value: 'directional', label: 'Directional', description: 'Long or short exposure' },
  { value: 'arbitrage', label: 'Arbitrage', description: 'Cross-exchange or cross-chain arb' },
  { value: 'custom', label: 'Custom', description: 'Custom strategy type' },
] as const;

// Extended store with strategies
export interface StrategyStore {
  strategies: Record<string, Strategy>;  // strategyId -> Strategy
}

// Generate unique strategy ID
export function generateStrategyId(): string {
  return `strat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== CRUD Operations ====================

// Create a new strategy
export function createStrategy(
  store: ReconciliationStore & StrategyStore,
  params: {
    name: string;
    type: Strategy['type'];
    description?: string;
    positions?: PositionAllocation[];
    targetAllocation?: Strategy['targetAllocation'];
    notes?: string;
    tags?: string[];
  }
): { store: ReconciliationStore & StrategyStore; strategy: Strategy } {
  const id = generateStrategyId();
  const now = Date.now();
  
  const strategy: Strategy = {
    id,
    name: params.name,
    type: params.type,
    description: params.description,
    positions: params.positions || [],
    targetAllocation: params.targetAllocation,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    notes: params.notes,
    tags: params.tags,
  };
  
  return {
    store: {
      ...store,
      strategies: {
        ...store.strategies,
        [id]: strategy,
      },
    },
    strategy,
  };
}


// Update a strategy
export function updateStrategy(
  store: ReconciliationStore & StrategyStore,
  strategyId: string,
  updates: Partial<Pick<Strategy, 'name' | 'type' | 'description' | 'status' | 'targetAllocation' | 'notes' | 'tags'>>
): ReconciliationStore & StrategyStore {
  const strategy = store.strategies[strategyId];
  if (!strategy) return store;
  
  return {
    ...store,
    strategies: {
      ...store.strategies,
      [strategyId]: {
        ...strategy,
        ...updates,
        updatedAt: Date.now(),
      },
    },
  };
}

// Delete a strategy (doesn't delete positions, just unlinks them)
export function deleteStrategy(
  store: ReconciliationStore & StrategyStore,
  strategyId: string
): ReconciliationStore & StrategyStore {
  const { [strategyId]: _, ...remainingStrategies } = store.strategies;
  
  return {
    ...store,
    strategies: remainingStrategies,
  };
}

// Add a position to a strategy
export function addPositionToStrategy(
  store: ReconciliationStore & StrategyStore,
  strategyId: string,
  positionId: string,
  percentage: number = 100
): ReconciliationStore & StrategyStore {
  const strategy = store.strategies[strategyId];
  if (!strategy) return store;
  
  // Check if position already in strategy
  const existingIdx = strategy.positions.findIndex(p => p.positionId === positionId);
  
  let newPositions: PositionAllocation[];
  if (existingIdx >= 0) {
    // Update existing allocation
    newPositions = [...strategy.positions];
    newPositions[existingIdx] = {
      ...newPositions[existingIdx],
      percentage,
    };
  } else {
    // Add new allocation
    newPositions = [
      ...strategy.positions,
      {
        positionId,
        percentage,
        addedAt: Date.now(),
      },
    ];
  }
  
  return {
    ...store,
    strategies: {
      ...store.strategies,
      [strategyId]: {
        ...strategy,
        positions: newPositions,
        updatedAt: Date.now(),
      },
    },
  };
}


// Remove a position from a strategy
export function removePositionFromStrategy(
  store: ReconciliationStore & StrategyStore,
  strategyId: string,
  positionId: string
): ReconciliationStore & StrategyStore {
  const strategy = store.strategies[strategyId];
  if (!strategy) return store;
  
  const newPositions = strategy.positions.filter(p => p.positionId !== positionId);
  
  return {
    ...store,
    strategies: {
      ...store.strategies,
      [strategyId]: {
        ...strategy,
        positions: newPositions,
        updatedAt: Date.now(),
      },
    },
  };
}

// Update position allocation percentage
export function updatePositionAllocation(
  store: ReconciliationStore & StrategyStore,
  strategyId: string,
  positionId: string,
  percentage: number
): ReconciliationStore & StrategyStore {
  const strategy = store.strategies[strategyId];
  if (!strategy) return store;
  
  const newPositions = strategy.positions.map(p => 
    p.positionId === positionId 
      ? { ...p, percentage } 
      : p
  );
  
  return {
    ...store,
    strategies: {
      ...store.strategies,
      [strategyId]: {
        ...strategy,
        positions: newPositions,
        updatedAt: Date.now(),
      },
    },
  };
}

// ==================== Helper Functions ====================

// Get all strategies
export function getStrategies(store: StrategyStore): Strategy[] {
  return Object.values(store.strategies || {});
}

// Get strategy by ID
export function getStrategy(store: StrategyStore, strategyId: string): Strategy | null {
  return store.strategies?.[strategyId] || null;
}

// Get strategies containing a position
export function getStrategiesForPosition(
  store: StrategyStore,
  positionId: string
): Strategy[] {
  return getStrategies(store).filter(s => 
    s.positions.some(p => p.positionId === positionId)
  );
}

// Get total allocation for a position across all strategies
export function getTotalPositionAllocation(
  store: StrategyStore,
  positionId: string
): number {
  let total = 0;
  for (const strategy of getStrategies(store)) {
    const allocation = strategy.positions.find(p => p.positionId === positionId);
    if (allocation) {
      total += allocation.percentage;
    }
  }
  return total;
}

// Get unallocated positions (not in any strategy)
export function getUnallocatedPositions(
  store: StrategyStore,
  allPositionIds: string[]
): string[] {
  const allocatedIds = new Set<string>();
  for (const strategy of getStrategies(store)) {
    for (const pos of strategy.positions) {
      allocatedIds.add(pos.positionId);
    }
  }
  return allPositionIds.filter(id => !allocatedIds.has(id));
}


// Calculate strategy status from positions
export function calculateStrategyStatus(
  strategy: Strategy,
  positions: Record<string, Position>
): StrategyStatus {
  if (strategy.positions.length === 0) return 'active';
  
  let hasOpen = false;
  let hasClosed = false;
  
  for (const alloc of strategy.positions) {
    const position = positions[alloc.positionId];
    if (!position) continue;
    
    if (position.status === 'open') hasOpen = true;
    if (position.status === 'closed') hasClosed = true;
  }
  
  if (hasOpen && hasClosed) return 'partial';
  if (hasClosed && !hasOpen) return 'closed';
  return 'active';
}

// Ensure store has strategies field
export function ensureStrategyStore(
  store: ReconciliationStore
): ReconciliationStore & StrategyStore {
  return {
    ...store,
    strategies: (store as any).strategies || {},
  };
}

// Combined store type
export type FullReconciliationStore = ReconciliationStore & {
  positions: Record<string, Position>;
  strategies: Record<string, Strategy>;
};

// Ensure full store
export function ensureFullStore(store: ReconciliationStore): FullReconciliationStore {
  return {
    ...store,
    positions: (store as any).positions || {},
    strategies: (store as any).strategies || {},
  };
}
