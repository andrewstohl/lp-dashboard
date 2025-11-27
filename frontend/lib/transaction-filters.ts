/**
 * Transaction Filter Utilities
 * 
 * Functions to detect and filter different types of transactions:
 * - Spam/Airdrop tokens
 * - Dust transactions (< $0.10)
 * - Approve transactions
 * - Deploy transactions (usually spam NFTs)
 */

import { type Transaction, type TokenMeta } from './api';

// Spam detection keywords
const SPAM_KEYWORDS = [
  'visit', 'x.com', 'claim', 't.me', 'airdrop', 
  '.com', '.io', '.xyz', '.org', '.app', '.net',
  'eligible', 'reward', 'bonus', 'free',
];

// Whitelist for legitimate tokens that might match spam patterns
const TOKEN_WHITELIST = [
  'usdc', 'usdt', 'dai', 'weth', 'wbtc', 'link', 'uni', 'aave',
  'comp', 'crv', 'mkr', 'snx', 'bal', 'yfi', 'sushi', 'inch',
  'gmx', 'arb', 'op', 'matic', 'avax', 'ftm', 'bnb',
];

/**
 * Check if a token symbol/name looks like spam
 */
export function isSpamToken(symbol: string, name: string): boolean {
  const symbolLower = (symbol || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  
  // Check whitelist first
  if (TOKEN_WHITELIST.some(t => symbolLower.includes(t))) {
    return false;
  }
  
  // Check for spam keywords
  const combined = `${symbolLower} ${nameLower}`;
  return SPAM_KEYWORDS.some(keyword => combined.includes(keyword));
}

/**
 * Check if a transaction involves spam tokens
 */
export function isSpamTransaction(
  tx: Transaction,
  tokenDict: Record<string, TokenMeta>
): boolean {
  // Check receives for spam tokens
  for (const receive of tx.receives || []) {
    const tokenId = receive.token_id || '';
    const tokenInfo = tokenDict[tokenId];
    
    if (tokenInfo) {
      if (isSpamToken(tokenInfo.symbol || '', tokenInfo.name || '')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a transaction is an approval
 */
export function isApproveTransaction(tx: Transaction): boolean {
  const category = tx.cate_id || tx.tx?.name || '';
  return category.toLowerCase() === 'approve';
}

/**
 * Check if a transaction is a deploy (usually spam NFTs)
 */
export function isDeployTransaction(tx: Transaction): boolean {
  const category = tx.cate_id || tx.tx?.name || '';
  return category.toLowerCase() === 'deploy';
}

/**
 * Calculate USD value of a transaction
 */
export function calculateTransactionValue(
  tx: Transaction,
  tokenDict: Record<string, TokenMeta>
): number {
  let totalValue = 0;
  
  // Sum sends
  for (const send of tx.sends || []) {
    const tokenId = send.token_id || '';
    const tokenInfo = tokenDict[tokenId];
    const price = tokenInfo?.price || 0;
    const amount = Math.abs(send.amount || 0);
    totalValue += amount * price;
  }
  
  // Sum receives
  for (const receive of tx.receives || []) {
    const tokenId = receive.token_id || '';
    const tokenInfo = tokenDict[tokenId];
    const price = tokenInfo?.price || 0;
    const amount = Math.abs(receive.amount || 0);
    totalValue += amount * price;
  }
  
  return totalValue;
}

/**
 * Check if a transaction is dust (very low value)
 */
export function isDustTransaction(
  tx: Transaction,
  tokenDict: Record<string, TokenMeta>,
  threshold: number = 0.10
): boolean {
  const value = calculateTransactionValue(tx, tokenDict);
  
  // If value is 0, check if there are any token transfers
  // Some transactions have value but price is not available
  if (value === 0) {
    const hasSends = (tx.sends || []).length > 0;
    const hasReceives = (tx.receives || []).length > 0;
    
    // If no transfers, it's a contract interaction (keep it)
    if (!hasSends && !hasReceives) {
      return false;
    }
    
    // If we have transfers but no price data, don't hide
    return false;
  }
  
  return value < threshold;
}


/**
 * Filter stats for display
 */
export interface FilterStats {
  total: number;
  spam: number;
  approves: number;
  deploys: number;
  dust: number;
  visible: number;
}

/**
 * Calculate filter statistics
 */
export function calculateFilterStats(
  transactions: Transaction[],
  tokenDict: Record<string, TokenMeta>,
  dustThreshold: number = 0.10
): FilterStats {
  let spam = 0;
  let approves = 0;
  let deploys = 0;
  let dust = 0;
  
  for (const tx of transactions) {
    if (isSpamTransaction(tx, tokenDict)) spam++;
    if (isApproveTransaction(tx)) approves++;
    if (isDeployTransaction(tx)) deploys++;
    if (isDustTransaction(tx, tokenDict, dustThreshold)) dust++;
  }
  
  return {
    total: transactions.length,
    spam,
    approves,
    deploys,
    dust,
    visible: transactions.length, // Will be calculated by caller based on active filters
  };
}

/**
 * Apply quick filters to transactions
 */
export function applyQuickFilters(
  transactions: Transaction[],
  tokenDict: Record<string, TokenMeta>,
  filters: {
    hideSpam: boolean;
    hideApproves: boolean;
    hideDeploys: boolean;
    hideDust: boolean;
    dustThreshold?: number;
  }
): Transaction[] {
  const { hideSpam, hideApproves, hideDeploys, hideDust, dustThreshold = 0.10 } = filters;
  
  return transactions.filter(tx => {
    if (hideSpam && isSpamTransaction(tx, tokenDict)) return false;
    if (hideApproves && isApproveTransaction(tx)) return false;
    if (hideDeploys && isDeployTransaction(tx)) return false;
    if (hideDust && isDustTransaction(tx, tokenDict, dustThreshold)) return false;
    return true;
  });
}
