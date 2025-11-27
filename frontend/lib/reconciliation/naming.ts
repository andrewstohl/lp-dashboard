/**
 * Position Naming Utilities
 * 
 * Generates standardized position names following the convention:
 * [Protocol] [Type] [Direction?] [Asset(s)] [MM/DD/YY]
 * 
 * Examples:
 * - GMX Short ETH 11/23/24
 * - Uniswap LP WETH/USDC 09/01/24
 * - Aave Lend USDC 08/20/24
 */

import type { Transaction, TokenMeta } from '@/lib/api';
import type { PositionType, Position } from './positions';

// Protocol display names
const PROTOCOL_NAMES: Record<string, string> = {
  'arb_gmx2': 'GMX',
  'uniswap3': 'Uniswap',
  'arb_uniswap3': 'Uniswap',
  'pancakeswap3': 'PancakeSwap',
  'sushiswap': 'SushiSwap',
  'aave3': 'Aave',
  'arb_aave3': 'Aave',
  'aave': 'Aave',
  'compound': 'Compound',
  'lido': 'Lido',
  'rocketpool': 'Rocket Pool',
  'eigenlayer': 'EigenLayer',
  'across': 'Across',
  'socket': 'Socket',
};

// Format date as MM/DD/YY
export function formatPositionDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

// Transaction types that indicate OPENING a new position
const OPENING_TX_PATTERNS: Record<string, string[]> = {
  // GMX - batch creates orders (sends collateral to GMX)
  'arb_gmx2': ['batch'],
  // Uniswap - mint/increase creates or adds to LP
  'uniswap3': ['mint', 'increaseLiquidity'],
  'arb_uniswap3': ['mint', 'increaseLiquidity'],
  // Aave - supply/borrow opens position
  'aave3': ['supply', 'deposit', 'borrow'],
  'arb_aave3': ['supply', 'deposit', 'borrow'],
  // Staking
  'lido': ['submit', 'stake'],
  'rocketpool': ['deposit', 'stake'],
  'eigenlayer': ['deposit', 'stake'],
};

// Transaction types that indicate MODIFYING an existing position
const MODIFYING_TX_PATTERNS: Record<string, string[]> = {
  // GMX - executeOrder is when order gets filled (could be open or close)
  'arb_gmx2': ['executeOrder', 'cancelOrder', 'updateOrder'],
  // Uniswap - collect/decrease modify existing
  'uniswap3': ['collect', 'decreaseLiquidity', 'burn'],
  'arb_uniswap3': ['collect', 'decreaseLiquidity', 'burn'],
  // Aave - withdraw/repay modify existing
  'aave3': ['withdraw', 'repay'],
  'arb_aave3': ['withdraw', 'repay'],
  // Staking
  'lido': ['withdraw', 'unstake'],
  'rocketpool': ['withdraw', 'unstake'],
  'eigenlayer': ['withdraw', 'unstake'],
};

export type TransactionIntent = 'opening' | 'modifying' | 'ambiguous';

/**
 * Determine if a transaction is opening a new position or modifying existing
 */
export function getTransactionIntent(tx: Transaction): TransactionIntent {
  const protocol = tx.project_id || '';
  const txName = tx.tx?.name || '';
  const cateId = tx.cate_id || '';
  
  // Check opening patterns
  const openingPatterns = OPENING_TX_PATTERNS[protocol] || [];
  for (const pattern of openingPatterns) {
    if (txName.toLowerCase().includes(pattern.toLowerCase())) {
      return 'opening';
    }
  }
  
  // Check modifying patterns  
  const modifyingPatterns = MODIFYING_TX_PATTERNS[protocol] || [];
  for (const pattern of modifyingPatterns) {
    if (txName.toLowerCase().includes(pattern.toLowerCase())) {
      return 'modifying';
    }
  }
  
  // Check category-based patterns
  if (cateId === 'receive' || cateId === 'send') {
    return 'ambiguous';
  }
  
  return 'ambiguous';
}

/**
 * Extract tokens involved in a transaction
 */
export function extractTokens(
  tx: Transaction, 
  tokenDict: Record<string, TokenMeta>
): string[] {
  const tokens = new Set<string>();
  
  for (const send of tx.sends || []) {
    if (send.token_id) {
      const tokenInfo = tokenDict[send.token_id];
      const symbol = tokenInfo?.symbol || '';
      // Filter spam
      if (symbol && symbol.length <= 10 && !symbol.includes('.com')) {
        tokens.add(symbol);
      }
    }
  }
  
  for (const recv of tx.receives || []) {
    if (recv.token_id && !recv.token_id.includes('nft')) {
      const tokenInfo = tokenDict[recv.token_id];
      const symbol = tokenInfo?.symbol || '';
      if (symbol && symbol.length <= 10 && !symbol.includes('.com')) {
        tokens.add(symbol);
      }
    }
  }
  
  return Array.from(tokens);
}

/**
 * Detect position type from protocol
 */
export function detectPositionType(protocol: string): PositionType {
  if (protocol.includes('gmx')) return 'perpetual';
  if (protocol.includes('uniswap') || protocol.includes('sushi') || protocol.includes('pancake')) return 'lp';
  if (protocol.includes('aave') || protocol.includes('compound') || protocol.includes('morpho')) return 'lending';
  if (protocol.includes('lido') || protocol.includes('rocket') || protocol.includes('eigen')) return 'staking';
  if (protocol.includes('bridge') || protocol.includes('across') || protocol.includes('socket')) return 'bridge';
  return 'unknown';
}

/**
 * Get protocol display name
 */
export function getProtocolName(protocol: string): string {
  return PROTOCOL_NAMES[protocol] || protocol.replace(/^arb_/, '').replace(/[0-9]+$/, '');
}

export interface PositionNameSuggestion {
  name: string;
  protocol: string;
  type: PositionType;
  direction?: 'Long' | 'Short';
  assets: string[];
  date: string;
  isOpeningTransaction: boolean;
}

/**
 * Generate a suggested position name for a transaction
 * Only suggests names for "opening" transactions
 */
export function generatePositionName(
  tx: Transaction,
  tokenDict: Record<string, TokenMeta>,
  gmxDirection?: boolean // isLong from GMX subgraph
): PositionNameSuggestion | null {
  const intent = getTransactionIntent(tx);
  const protocol = tx.project_id || 'unknown';
  const protocolName = getProtocolName(protocol);
  const positionType = detectPositionType(protocol);
  const tokens = extractTokens(tx, tokenDict);
  const date = formatPositionDate(tx.time_at);
  
  // Build name parts
  const parts: string[] = [protocolName];
  
  // Add type/direction
  if (positionType === 'perpetual') {
    // For perpetuals, use Long/Short instead of type
    const direction = gmxDirection === true ? 'Long' : gmxDirection === false ? 'Short' : null;
    if (direction) {
      parts.push(direction);
    } else {
      parts.push('Perp'); // Fallback if direction unknown
    }
  } else if (positionType === 'lp') {
    parts.push('LP');
  } else if (positionType === 'lending') {
    // Could be Lend or Borrow - check tx name
    const txName = tx.tx?.name?.toLowerCase() || '';
    if (txName.includes('borrow')) {
      parts.push('Borrow');
    } else {
      parts.push('Lend');
    }
  } else if (positionType === 'staking') {
    parts.push('Stake');
  } else if (positionType === 'bridge') {
    parts.push('Bridge');
  }
  
  // Add assets
  if (tokens.length >= 2 && positionType === 'lp') {
    // For LP, show as pair (base/quote - sort alphabetically for consistency)
    parts.push(tokens.slice(0, 2).sort().join('/'));
  } else if (tokens.length >= 1) {
    // For others, show primary asset
    parts.push(tokens[0]);
  }
  
  // Add date
  parts.push(date);
  
  return {
    name: parts.join(' '),
    protocol,
    type: positionType,
    direction: gmxDirection === true ? 'Long' : gmxDirection === false ? 'Short' : undefined,
    assets: tokens,
    date,
    isOpeningTransaction: intent === 'opening',
  };
}

/**
 * Find matching existing positions for a transaction
 * Returns positions sorted by likelihood of match
 */
export function findMatchingPositions(
  tx: Transaction,
  positions: Position[],
  tokenDict: Record<string, TokenMeta>
): Position[] {
  const protocol = tx.project_id || '';
  const chain = tx.chain || '';
  const tokens = extractTokens(tx, tokenDict);
  
  // Score each position by match quality
  const scored = positions.map(pos => {
    let score = 0;
    
    // Same protocol = strong match
    if (pos.protocol === protocol) score += 10;
    
    // Same chain = good match
    if (pos.chain === chain) score += 5;
    
    // Matching tokens
    if (pos.tokenPair) {
      const posTokens = pos.tokenPair.split('/');
      for (const token of tokens) {
        if (posTokens.includes(token)) score += 3;
      }
    }
    
    // Open positions preferred over closed
    if (pos.status === 'open') score += 2;
    
    return { position: pos, score };
  });
  
  // Filter to only positions with some match, sort by score
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.position);
}

/**
 * Get the suggested action for a transaction
 */
export interface TransactionSuggestion {
  intent: TransactionIntent;
  suggestedName: string | null;
  matchingPositions: Position[];
  allPositions: Position[];
}

export function getTransactionSuggestion(
  tx: Transaction,
  positions: Position[],
  tokenDict: Record<string, TokenMeta>,
  gmxDirection?: boolean
): TransactionSuggestion {
  const intent = getTransactionIntent(tx);
  const matchingPositions = findMatchingPositions(tx, positions, tokenDict);
  
  // Generate suggested name for opening transactions
  // Show suggestion if: it's an opening transaction AND (no positions exist OR no matching positions)
  let suggestedName: string | null = null;
  if (intent === 'opening') {
    const nameSuggestion = generatePositionName(tx, tokenDict, gmxDirection);
    suggestedName = nameSuggestion?.name || null;
  }
  
  return {
    intent,
    suggestedName,
    matchingPositions,
    allPositions: positions,
  };
}
