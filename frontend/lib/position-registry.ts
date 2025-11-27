/**
 * Position Registry - Auto-discovers positions from protocol subgraphs
 * and matches them to DeBank transactions by transaction hash
 */

// GMX market address to asset mapping
const GMX_MARKETS: Record<string, string> = {
  '0x70d95587d40a2caf56bd97485ab3eec10bee6336': 'ETH',
  '0x7f1fa204bb700853d36994da19f830b6ad18455c': 'ETH',
  '0x47c031236e19d024b42f8ae6780e44a573170703': 'BTC',
  '0x2f5f7c7d5e6a6c4d3e5b4f5a5b5c5d5e5f6a6b7c': 'BTC', // placeholder
};

export interface ProtocolPosition {
  id: string;                    // Unique position ID (e.g., positionKey for GMX)
  protocol: 'gmx' | 'uniswap' | 'aave' | 'other';
  chain: string;
  name: string;                  // Human readable: "GMX Short ETH"
  asset: string;                 // Primary asset
  assetPair?: string;            // For LPs: "ETH/USDC"
  direction?: 'long' | 'short';  // For perpetuals
  status: 'open' | 'closed';
  openedAt: number;              // Unix timestamp
  closedAt?: number;
  txHashes: string[];            // All related transaction hashes
  metrics: {
    sizeUsd?: number;
    collateralUsd?: number;
    realizedPnl?: number;
    unrealizedPnl?: number;
    feesEarned?: number;
  };
}

export interface PositionRegistry {
  positions: ProtocolPosition[];
  txToPosition: Record<string, string>;  // txHash -> positionId
  lastUpdated: number;
}


/**
 * Fetch GMX positions from subgraph and group by positionKey
 */
export async function fetchGmxPositions(walletAddress: string): Promise<ProtocolPosition[]> {
  const query = `{
    tradeActions(
      first: 1000,
      where: { account: "${walletAddress.toLowerCase()}" },
      orderBy: timestamp,
      orderDirection: asc
    ) {
      id
      transaction
      timestamp
      eventName
      marketAddress
      orderKey
      orderType
      isLong
      sizeDeltaUsd
    }
  }`;

  try {
    const response = await fetch(
      'https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }
    );

    const data = await response.json();
    const tradeActions = data?.data?.tradeActions || [];

    if (tradeActions.length === 0) {
      return [];
    }

    // Group by orderKey to pair OrderCreated + OrderExecuted
    const byOrderKey: Record<string, typeof tradeActions> = {};
    for (const action of tradeActions) {
      const key = action.orderKey;
      if (!byOrderKey[key]) byOrderKey[key] = [];
      byOrderKey[key].push(action);
    }

    // Group orders into positions by market + direction
    // A position is identified by: market + isLong combination
    const positionGroups: Record<string, {
      market: string;
      isLong: boolean;
      orders: typeof tradeActions;
      txHashes: Set<string>;
      firstTimestamp: number;
      lastTimestamp: number;
      totalSizeChange: number;
    }> = {};

    for (const [orderKey, actions] of Object.entries(byOrderKey)) {
      // Use the first action to get market info
      const first = actions[0];
      const market = first.marketAddress;
      const isLong = first.isLong;
      const posKey = `${market}-${isLong ? 'long' : 'short'}`;

      if (!positionGroups[posKey]) {
        positionGroups[posKey] = {
          market,
          isLong,
          orders: [],
          txHashes: new Set(),
          firstTimestamp: first.timestamp,
          lastTimestamp: first.timestamp,
          totalSizeChange: 0,
        };
      }

      const group = positionGroups[posKey];
      group.orders.push(...actions);
      
      for (const action of actions) {
        if (action.transaction) {
          group.txHashes.add(action.transaction);
        }
        group.firstTimestamp = Math.min(group.firstTimestamp, action.timestamp);
        group.lastTimestamp = Math.max(group.lastTimestamp, action.timestamp);
        
        // Track size changes
        const sizeDelta = parseFloat(action.sizeDeltaUsd || '0') / 1e30;
        if (action.eventName === 'OrderExecuted') {
          // orderType 2 = MarketIncrease, 4 = MarketDecrease
          const orderType = parseInt(action.orderType);
          if (orderType === 2 || orderType === 0) {
            group.totalSizeChange += sizeDelta;
          } else if (orderType === 4 || orderType === 1) {
            group.totalSizeChange -= sizeDelta;
          }
        }
      }
    }


    // Convert to ProtocolPosition format
    const positions: ProtocolPosition[] = [];
    
    for (const [posKey, group] of Object.entries(positionGroups)) {
      const asset = GMX_MARKETS[group.market] || 'UNKNOWN';
      const direction = group.isLong ? 'long' : 'short';
      const directionLabel = group.isLong ? 'Long' : 'Short';
      
      // Format date for position name
      const openDate = new Date(group.firstTimestamp * 1000);
      const dateStr = `${String(openDate.getMonth() + 1).padStart(2, '0')}/${String(openDate.getDate()).padStart(2, '0')}`;
      
      // Position is closed if total size change is ~0
      const isClosed = Math.abs(group.totalSizeChange) < 100;
      
      positions.push({
        id: posKey,
        protocol: 'gmx',
        chain: 'arb',
        name: `GMX ${directionLabel} ${asset} ${dateStr}`,
        asset,
        direction,
        status: isClosed ? 'closed' : 'open',
        openedAt: group.firstTimestamp,
        closedAt: isClosed ? group.lastTimestamp : undefined,
        txHashes: Array.from(group.txHashes),
        metrics: {
          sizeUsd: Math.abs(group.totalSizeChange),
        },
      });
    }

    return positions;
  } catch (error) {
    console.error('Failed to fetch GMX positions:', error);
    return [];
  }
}


/**
 * Fetch Uniswap V3 LP positions and their transaction history
 */
export async function fetchUniswapPositions(walletAddress: string): Promise<ProtocolPosition[]> {
  // Query both mainnet and Arbitrum
  const subgraphs = [
    {
      chain: 'eth',
      url: 'https://gateway.thegraph.com/api/72e74fa579b0409acb0be67d11e4dce6/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
    },
    {
      chain: 'arb', 
      url: 'https://gateway.thegraph.com/api/72e74fa579b0409acb0be67d11e4dce6/subgraphs/id/FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM',
    },
  ];

  const positions: ProtocolPosition[] = [];

  for (const { chain, url } of subgraphs) {
    const query = `{
      positions(
        where: { owner: "${walletAddress.toLowerCase()}" },
        first: 100
      ) {
        id
        owner
        liquidity
        depositedToken0
        depositedToken1
        token0 { symbol decimals }
        token1 { symbol decimals }
        pool { feeTier }
        transaction { id timestamp }
      }
    }`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      const lpPositions = data?.data?.positions || [];

      for (const lp of lpPositions) {
        const token0 = lp.token0?.symbol || '???';
        const token1 = lp.token1?.symbol || '???';
        const feeTier = (parseInt(lp.pool?.feeTier || '0') / 10000).toFixed(2);
        const liquidity = lp.liquidity || '0';
        const isClosed = liquidity === '0';
        
        const mintTx = lp.transaction?.id;
        const mintTimestamp = parseInt(lp.transaction?.timestamp || '0');
        
        // Format date
        const openDate = new Date(mintTimestamp * 1000);
        const dateStr = `${String(openDate.getMonth() + 1).padStart(2, '0')}/${String(openDate.getDate()).padStart(2, '0')}`;

        positions.push({
          id: `uniswap-${chain}-${lp.id}`,
          protocol: 'uniswap',
          chain,
          name: `Uniswap ${token0}/${token1} ${feeTier}% ${dateStr}`,
          asset: token0,
          assetPair: `${token0}/${token1}`,
          status: isClosed ? 'closed' : 'open',
          openedAt: mintTimestamp,
          txHashes: mintTx ? [mintTx] : [],
          metrics: {
            // Would need more queries to get fees, current value, etc.
          },
        });
      }
    } catch (error) {
      console.error(`Failed to fetch Uniswap positions for ${chain}:`, error);
    }
  }

  return positions;
}


/**
 * Build the complete position registry with tx hash mapping
 */
export async function buildPositionRegistry(walletAddress: string): Promise<PositionRegistry> {
  // Fetch positions from all protocols in parallel
  const [gmxPositions, uniswapPositions] = await Promise.all([
    fetchGmxPositions(walletAddress),
    fetchUniswapPositions(walletAddress),
  ]);

  const allPositions = [...gmxPositions, ...uniswapPositions];

  // Build tx hash -> position ID mapping
  const txToPosition: Record<string, string> = {};
  for (const pos of allPositions) {
    for (const txHash of pos.txHashes) {
      if (txHash) {
        txToPosition[txHash.toLowerCase()] = pos.id;
      }
    }
  }

  return {
    positions: allPositions,
    txToPosition,
    lastUpdated: Date.now(),
  };
}

/**
 * Match a DeBank transaction to a position
 */
export function matchTransactionToPosition(
  txHash: string,
  registry: PositionRegistry
): ProtocolPosition | null {
  const positionId = registry.txToPosition[txHash.toLowerCase()];
  if (!positionId) return null;
  
  return registry.positions.find(p => p.id === positionId) || null;
}

/**
 * Get all transactions for a position
 */
export function getPositionTransactions(
  positionId: string,
  registry: PositionRegistry,
  allTransactions: { id: string }[]
): typeof allTransactions {
  const position = registry.positions.find(p => p.id === positionId);
  if (!position) return [];
  
  const txHashSet = new Set(position.txHashes.map(h => h.toLowerCase()));
  return allTransactions.filter(tx => txHashSet.has(tx.id.toLowerCase()));
}

/**
 * Categorize transactions as matched vs unmatched
 */
export function categorizeTransactions<T extends { id: string }>(
  transactions: T[],
  registry: PositionRegistry
): {
  matched: { transaction: T; position: ProtocolPosition }[];
  unmatched: T[];
} {
  const matched: { transaction: T; position: ProtocolPosition }[] = [];
  const unmatched: T[] = [];

  for (const tx of transactions) {
    const position = matchTransactionToPosition(tx.id, registry);
    if (position) {
      matched.push({ transaction: tx, position });
    } else {
      unmatched.push(tx);
    }
  }

  return { matched, unmatched };
}
