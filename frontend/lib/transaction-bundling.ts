/**
 * Transaction Bundling Utilities
 * 
 * Groups related transactions together to reduce clutter:
 * 1. GMX: batch + executeOrder pairs
 * 2. Approves: approve + following action on same protocol
 * 3. Gas refunds: tiny ETH receives
 */

import type { Transaction, TokenMeta } from '@/lib/api';

export interface TransactionBundle {
  id: string;                    // Bundle ID (primary tx hash)
  type: 'gmx_order' | 'approve_action' | 'gas_refund' | 'single';
  primaryTx: Transaction;        // Main transaction to display
  relatedTxs: Transaction[];     // Related transactions (hidden but tracked)
  displayName: string;           // Human-readable bundle name
  totalUsdValue: number;         // Combined USD value
}

/**
 * Check if a transaction is a gas refund (tiny ETH receive only)
 */
export function isGasRefund(tx: Transaction, tokenDict: Record<string, TokenMeta>): boolean {
  const receives = tx.receives || [];
  const sends = tx.sends || [];
  
  // Must have only receives, no sends
  if (sends.length > 0 || receives.length === 0) return false;
  
  // All receives must be tiny ETH amounts
  for (const recv of receives) {
    const token = tokenDict[recv.token_id];
    const symbol = token?.symbol?.toUpperCase() || '';
    
    // Must be ETH/WETH
    if (!['ETH', 'WETH'].includes(symbol)) return false;
    
    // Must be tiny amount (less than $1 worth, roughly 0.0003 ETH)
    if (recv.amount > 0.0003) return false;
  }
  
  return true;
}

/**
 * Check if transaction is an approve
 */
export function isApprove(tx: Transaction): boolean {
  return tx.cate_id === 'approve';
}

/**
 * Find GMX batch + executeOrder pairs
 * Returns map of batch txHash -> execute txHash
 */
export function findGmxPairs(
  transactions: Transaction[]
): Map<string, string> {
  const pairs = new Map<string, string>();
  const gmxTxs = transactions
    .filter(tx => tx.project_id === 'arb_gmx2')
    .sort((a, b) => a.time_at - b.time_at);
  
  const usedExecutes = new Set<string>();
  
  for (const batch of gmxTxs) {
    if (batch.tx?.name !== 'batch') continue;
    
    // Find closest executeOrder within 2 minutes
    let bestExecute: Transaction | null = null;
    let bestTimeDiff = Infinity;
    
    for (const exec of gmxTxs) {
      if (exec.tx?.name !== 'executeOrder') continue;
      if (usedExecutes.has(exec.id)) continue;
      
      const timeDiff = Math.abs(exec.time_at - batch.time_at);
      if (timeDiff <= 120 && timeDiff < bestTimeDiff) {
        bestExecute = exec;
        bestTimeDiff = timeDiff;
      }
    }
    
    if (bestExecute) {
      pairs.set(batch.id, bestExecute.id);
      usedExecutes.add(bestExecute.id);
    }
  }
  
  return pairs;
}

/**
 * Find approve + action pairs
 * Returns map of approve txHash -> action txHash
 */
export function findApprovePairs(
  transactions: Transaction[]
): Map<string, string> {
  const pairs = new Map<string, string>();
  const sorted = [...transactions].sort((a, b) => a.time_at - b.time_at);
  
  const usedActions = new Set<string>();
  
  for (const approve of sorted) {
    if (!isApprove(approve)) continue;
    
    const approveProtocol = approve.project_id;
    const approveChain = approve.chain;
    
    // Find next non-approve action on same protocol within 5 minutes
    for (const action of sorted) {
      if (action.time_at <= approve.time_at) continue;
      if (action.time_at - approve.time_at > 300) break; // 5 min window
      
      if (isApprove(action)) continue;
      if (usedActions.has(action.id)) continue;
      
      // Same chain required
      if (action.chain !== approveChain) continue;
      
      // Same protocol OR action is on a known DEX/protocol
      if (action.project_id === approveProtocol || 
          action.project_id?.includes('uniswap') ||
          action.project_id?.includes('0x') ||
          action.project_id?.includes('socket')) {
        pairs.set(approve.id, action.id);
        usedActions.add(action.id);
        break;
      }
    }
  }
  
  return pairs;
}

/**
 * Calculate total USD value of transactions
 */
function calculateTotalUsd(
  txs: Transaction[], 
  tokenDict: Record<string, TokenMeta>
): number {
  let total = 0;
  for (const tx of txs) {
    for (const recv of tx.receives || []) {
      const token = tokenDict[recv.token_id];
      if (token?.price) total += recv.amount * token.price;
    }
    for (const send of tx.sends || []) {
      const token = tokenDict[send.token_id];
      if (token?.price) total -= send.amount * token.price;
    }
  }
  return total;
}

/**
 * Bundle transactions into groups
 */
export function bundleTransactions(
  transactions: Transaction[],
  tokenDict: Record<string, TokenMeta>
): TransactionBundle[] {
  const bundles: TransactionBundle[] = [];
  const bundledTxIds = new Set<string>();
  
  // 1. Find GMX pairs
  const gmxPairs = findGmxPairs(transactions);
  const txById = new Map(transactions.map(tx => [tx.id, tx]));
  
  for (const [batchId, execId] of gmxPairs) {
    const batch = txById.get(batchId);
    const exec = txById.get(execId);
    if (!batch || !exec) continue;
    
    bundledTxIds.add(batchId);
    bundledTxIds.add(execId);
    
    // Determine if this is opening or closing based on what was received
    const execReceives = exec.receives || [];
    const hasLargeUsdcReceive = execReceives.some(r => {
      const token = tokenDict[r.token_id];
      return token?.symbol === 'USDC' && r.amount > 100;
    });
    
    const displayName = hasLargeUsdcReceive 
      ? 'GMX Close Position' 
      : 'GMX Open/Modify Position';
    
    bundles.push({
      id: batchId,
      type: 'gmx_order',
      primaryTx: batch,
      relatedTxs: [exec],
      displayName,
      totalUsdValue: calculateTotalUsd([batch, exec], tokenDict),
    });
  }
  
  // 2. Find approve pairs
  const approvePairs = findApprovePairs(transactions);
  
  for (const [approveId, actionId] of approvePairs) {
    if (bundledTxIds.has(approveId) || bundledTxIds.has(actionId)) continue;
    
    const approve = txById.get(approveId);
    const action = txById.get(actionId);
    if (!approve || !action) continue;
    
    bundledTxIds.add(approveId);
    bundledTxIds.add(actionId);
    
    const actionName = action.tx?.name || action.cate_id || 'Action';
    const protocol = action.project_id?.replace(/^arb_|^op_|^base_/, '') || 'Unknown';
    
    bundles.push({
      id: actionId, // Use action as primary
      type: 'approve_action',
      primaryTx: action,
      relatedTxs: [approve],
      displayName: `${protocol} ${actionName} (+ approve)`,
      totalUsdValue: calculateTotalUsd([approve, action], tokenDict),
    });
  }

  // 3. Gas refunds - mark but keep separate for now
  for (const tx of transactions) {
    if (bundledTxIds.has(tx.id)) continue;
    
    if (isGasRefund(tx, tokenDict)) {
      bundledTxIds.add(tx.id);
      bundles.push({
        id: tx.id,
        type: 'gas_refund',
        primaryTx: tx,
        relatedTxs: [],
        displayName: 'Gas Refund',
        totalUsdValue: calculateTotalUsd([tx], tokenDict),
      });
    }
  }
  
  // 4. Single transactions (not bundled)
  for (const tx of transactions) {
    if (bundledTxIds.has(tx.id)) continue;
    
    const protocol = tx.project_id?.replace(/^arb_|^op_|^base_/, '') || '';
    const txName = tx.tx?.name || tx.cate_id || 'Transaction';
    
    bundles.push({
      id: tx.id,
      type: 'single',
      primaryTx: tx,
      relatedTxs: [],
      displayName: protocol ? `${protocol} ${txName}` : txName,
      totalUsdValue: calculateTotalUsd([tx], tokenDict),
    });
  }
  
  // Sort by primary transaction time (newest first)
  bundles.sort((a, b) => b.primaryTx.time_at - a.primaryTx.time_at);
  
  return bundles;
}

/**
 * Get bundling statistics
 */
export function getBundleStats(bundles: TransactionBundle[]): {
  totalBundles: number;
  gmxOrders: number;
  approveActions: number;
  gasRefunds: number;
  singleTxs: number;
  totalTransactions: number;
} {
  const stats = {
    totalBundles: bundles.length,
    gmxOrders: 0,
    approveActions: 0,
    gasRefunds: 0,
    singleTxs: 0,
    totalTransactions: 0,
  };
  
  for (const bundle of bundles) {
    stats.totalTransactions += 1 + bundle.relatedTxs.length;
    switch (bundle.type) {
      case 'gmx_order': stats.gmxOrders++; break;
      case 'approve_action': stats.approveActions++; break;
      case 'gas_refund': stats.gasRefunds++; break;
      case 'single': stats.singleTxs++; break;
    }
  }
  
  return stats;
}
