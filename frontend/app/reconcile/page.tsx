"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Search, FileCheck2, Eye, EyeOff, RefreshCw, Database, List, Layers, Target } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { TransactionListSortable } from "@/components/TransactionListSortable";
import { FilterBar } from "@/components/FilterBar";
import { QuickFilters } from "@/components/QuickFilters";
import { ReconcileSummary } from "@/components/ReconcileSummary";
import { Tabs, type Tab } from "@/components/Tabs";
import {
  applyQuickFilters,
  calculateFilterStats,
  type FilterStats,
} from "@/lib/transaction-filters";
import { PositionSuggestionsPanel } from "@/components/PositionSuggestionsPanel";
import { CreatePositionModal } from "@/components/CreatePositionModal";
import { 
  fetchTransactions, 
  type Transaction, 
  type TransactionsResponse,
  type TokenMeta,
  type ProjectMeta
} from "@/lib/api";
import {
  loadReconciliationStore,
  saveReconciliationStore,
  hideTransaction,
  unhideTransaction,
  getHiddenTxKeys,
  type ReconciliationStore
} from "@/lib/reconciliation/storage";
import {
  suggestPositions,
  ensurePositionStore,
  getPositions,
  deletePosition,
  type Position,
  type PositionSuggestion,
  type PositionStore,
} from "@/lib/reconciliation/positions";
import {
  ensureStrategyStore,
  getStrategies,
  createStrategy,
  deleteStrategy,
  type Strategy,
  type StrategyStore,
} from "@/lib/reconciliation/strategies";
import { PositionsStrategiesPanel } from "@/components/PositionsStrategiesPanel";
import { CreateStrategyModal } from "@/components/CreateStrategyModal";

export default function ReconcilePage() {
  const [walletAddress, setWalletAddress] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastWalletAddress') || '0x23b50a703d3076b73584df48251931ebf5937ba2';
    }
    return '0x23b50a703d3076b73584df48251931ebf5937ba2';
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tokenDict, setTokenDict] = useState<Record<string, TokenMeta>>({});
  const [projectDict, setProjectDict] = useState<Record<string, ProjectMeta>>({});
  const [chainNames, setChainNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TransactionsResponse['data']['summary'] | null>(null);
  const [chainsWithData, setChainsWithData] = useState<string[]>([]);
  const [cacheStatus, setCacheStatus] = useState<TransactionsResponse['data']['cache'] | null>(null);

  // Filter state
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("6m");

  // Reconciliation state
  const [reconciliationStore, setReconciliationStore] = useState<ReconciliationStore | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenTxKeys, setHiddenTxKeys] = useState<Set<string>>(new Set());

  // Position state
  const [positionSuggestions, setPositionSuggestions] = useState<PositionSuggestion[]>([]);
  const [showCreatePositionModal, setShowCreatePositionModal] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PositionSuggestion | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);

  // Strategy state
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [showCreateStrategyModal, setShowCreateStrategyModal] = useState(false);

  // Quick filter state (spam enabled by default)
  const [hideSpam, setHideSpam] = useState(true);
  const [hideApproves, setHideApproves] = useState(false);
  const [hideDeploys, setHideDeploys] = useState(false);
  const [hideDust, setHideDust] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'transactions' | 'positions' | 'strategies'>('transactions');

  // Load reconciliation store when wallet changes
  useEffect(() => {
    if (walletAddress && typeof window !== 'undefined') {
      const store = loadReconciliationStore(walletAddress);
      setReconciliationStore(store);
      setHiddenTxKeys(new Set(getHiddenTxKeys(store)));
      
      // Load positions and strategies
      const storeWithPositions = ensurePositionStore(store);
      const storeWithStrategies = ensureStrategyStore(storeWithPositions);
      setPositions(getPositions(storeWithPositions));
      setStrategies(getStrategies(storeWithStrategies));
    }
  }, [walletAddress]);

  // Track if we've auto-loaded on mount
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);

  // Handle hiding a transaction
  const handleHide = useCallback((chain: string, txHash: string) => {
    if (!reconciliationStore) return;
    
    const updatedStore = hideTransaction(reconciliationStore, chain, txHash);
    saveReconciliationStore(updatedStore);
    setReconciliationStore(updatedStore);
    setHiddenTxKeys(new Set(getHiddenTxKeys(updatedStore)));
  }, [reconciliationStore]);

  // Handle unhiding a transaction
  const handleUnhide = useCallback((chain: string, txHash: string) => {
    if (!reconciliationStore) return;
    
    const updatedStore = unhideTransaction(reconciliationStore, chain, txHash);
    saveReconciliationStore(updatedStore);
    setReconciliationStore(updatedStore);
    setHiddenTxKeys(new Set(getHiddenTxKeys(updatedStore)));
  }, [reconciliationStore]);

  // Fetch transactions with current filters
  const fetchWithFilters = useCallback(async (forceRefresh: boolean = false) => {
    if (!walletAddress.trim()) {
      setError("Please enter a wallet address");
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('lastWalletAddress', walletAddress.trim());
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchTransactions(walletAddress.trim(), { 
        since: dateRange === "all" ? "10y" : dateRange,
        chain: selectedChain || undefined,
        project: selectedProject || undefined,
        limit: 200,
        forceRefresh
      });
      
      setTransactions(result.data.transactions);
      setTokenDict(result.data.tokenDict);
      setProjectDict(result.data.projectDict);
      setChainNames(result.data.chainNames);
      setSummary(result.data.summary);
      setChainsWithData(result.data.chainsWithData || []);
      setCacheStatus(result.data.cache || null);
      
      console.log('Discovery Response:', result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
      setTransactions([]);
      setSummary(null);
      setCacheStatus(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, dateRange, selectedChain, selectedProject]);

  // Auto-load transactions on page mount if wallet address exists
  useEffect(() => {
    if (walletAddress && !hasAutoLoaded && typeof window !== 'undefined') {
      setHasAutoLoaded(true);
      fetchWithFilters(false);
    }
  }, [walletAddress, hasAutoLoaded, fetchWithFilters]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchWithFilters(false);
  };

  const handleForceRefresh = () => {
    fetchWithFilters(true);
  };

  // Compute position suggestions when transactions change
  useEffect(() => {
    if (transactions.length > 0 && reconciliationStore) {
      const storeWithPositions = ensurePositionStore(reconciliationStore);
      const suggestions = suggestPositions(transactions, storeWithPositions, projectDict, tokenDict);
      setPositionSuggestions(suggestions);
    } else {
      setPositionSuggestions([]);
    }
  }, [transactions, reconciliationStore, projectDict]);

  // Handle creating a position from suggestion
  const handleCreatePosition = (suggestion: PositionSuggestion) => {
    setSelectedSuggestion(suggestion);
    setShowCreatePositionModal(true);
  };

  // Handle position save
  const handlePositionSave = (position: Position) => {
    if (!reconciliationStore) return;
    
    // The position was already created in the modal, we just need to update the store
    const storeWithPositions = ensurePositionStore(reconciliationStore);
    
    // Add position to store
    const updatedStore = {
      ...storeWithPositions,
      positions: {
        ...storeWithPositions.positions,
        [position.id]: position,
      },
    };
    
    // Update transaction overlays with position link
    for (const txKey of position.txKeys) {
      updatedStore.transactions[txKey] = {
        ...updatedStore.transactions[txKey],
        txKey,
        hidden: updatedStore.transactions[txKey]?.hidden || false,
        positionId: position.id,
      };
    }
    
    saveReconciliationStore(updatedStore);
    setReconciliationStore(updatedStore);
    setPositions(getPositions(updatedStore));
    
    // Recompute suggestions
    const suggestions = suggestPositions(transactions, updatedStore, projectDict, tokenDict);
    setPositionSuggestions(suggestions);
    
    // Close modal
    setShowCreatePositionModal(false);
    setSelectedSuggestion(null);
  };

  // Handle position delete
  const handleDeletePosition = (positionId: string) => {
    if (!reconciliationStore) return;
    
    const storeWithPositions = ensurePositionStore(reconciliationStore);
    const updatedStore = deletePosition(storeWithPositions, positionId);
    
    saveReconciliationStore(updatedStore);
    setReconciliationStore(updatedStore);
    setPositions(getPositions(updatedStore));
    
    // Recompute suggestions
    const suggestions = suggestPositions(transactions, updatedStore, projectDict, tokenDict);
    setPositionSuggestions(suggestions);
  };

  // Handle strategy save
  const handleStrategySave = (strategy: Strategy) => {
    if (!reconciliationStore) return;
    
    const storeWithStrategies = ensureStrategyStore(reconciliationStore);
    
    const updatedStore = {
      ...storeWithStrategies,
      strategies: {
        ...storeWithStrategies.strategies,
        [strategy.id]: strategy,
      },
    };
    
    saveReconciliationStore(updatedStore);
    setReconciliationStore(updatedStore);
    setStrategies(getStrategies(updatedStore));
    
    setShowCreateStrategyModal(false);
  };

  // Handle strategy delete
  const handleDeleteStrategy = (strategyId: string) => {
    if (!reconciliationStore) return;
    
    const storeWithStrategies = ensureStrategyStore(reconciliationStore);
    const updatedStore = deleteStrategy(storeWithStrategies, strategyId);
    
    saveReconciliationStore(updatedStore);
    setReconciliationStore(updatedStore);
    setStrategies(getStrategies(updatedStore));
  };

  // Build project names map from projectDict
  const projectNames = Object.fromEntries(
    Object.entries(projectDict).map(([id, info]) => [id, info.name])
  );

  // Get unique projects from summary
  const availableProjects = summary?.byProject 
    ? Object.keys(summary.byProject).filter(p => p !== 'other')
    : [];

  // Apply quick filters to transactions
  const filteredTransactions = applyQuickFilters(
    transactions,
    tokenDict,
    { hideSpam, hideApproves, hideDeploys, hideDust }
  );

  // Calculate filter stats
  const filterStats: FilterStats = {
    ...calculateFilterStats(transactions, tokenDict),
    visible: filteredTransactions.length,
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <header className="bg-[#161B22] border-b border-[#21262D] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#58A6FF]" />
              <h1 className="text-2xl font-bold text-[#E6EDF3]">VORA Dashboard</h1>
            </div>
            <Navigation />
          </div>
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Enter wallet address (0x...)"
                  className="w-full px-4 py-3 pl-12 bg-[#1C2128] border border-[#30363D] text-[#E6EDF3] placeholder-[#8B949E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#58A6FF] focus:border-transparent"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-[#58A6FF] text-[#0D1117] font-semibold rounded-lg hover:bg-[#79B8FF] transition-colors disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load"}
              </button>
            </div>
          </form>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-[#58A6FF] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-[#8B949E]">Discovering transactions across all chains...</p>
          </div>
        ) : error ? (
          <div className="bg-[#161B22] rounded-lg border border-[#F85149] p-12 text-center">
            <p className="text-[#F85149] mb-2">Error</p>
            <p className="text-[#8B949E]">{error}</p>
          </div>
        ) : summary ? (
          <div className="space-y-6">
            {/* Filter Bar */}
            <FilterBar
              chains={chainsWithData}
              chainNames={chainNames}
              projects={availableProjects}
              projectNames={projectNames}
              selectedChain={selectedChain}
              selectedProject={selectedProject}
              dateRange={dateRange}
              onChainChange={setSelectedChain}
              onProjectChange={setSelectedProject}
              onDateRangeChange={setDateRange}
              onApplyFilters={fetchWithFilters}
            />

            {/* Quick Filters */}
            <QuickFilters
              stats={filterStats}
              hideSpam={hideSpam}
              hideApproves={hideApproves}
              hideDeploys={hideDeploys}
              hideDust={hideDust}
              onToggleSpam={() => setHideSpam(!hideSpam)}
              onToggleApproves={() => setHideApproves(!hideApproves)}
              onToggleDeploys={() => setHideDeploys(!hideDeploys)}
              onToggleDust={() => setHideDust(!hideDust)}
            />

            {/* Summary Stats */}
            <ReconcileSummary
              transactions={transactions}
              tokenDict={tokenDict}
              chainNames={chainNames}
              hiddenTxKeys={hiddenTxKeys}
            />

            {/* Tabbed Content */}
            <div className="bg-[#161B22] rounded-lg border border-[#21262D] overflow-hidden">
              <Tabs
                tabs={[
                  { id: 'transactions', label: 'Transactions', count: filteredTransactions.length, icon: <List className="w-4 h-4" /> },
                  { id: 'positions', label: 'Positions', count: positions.length, icon: <Layers className="w-4 h-4" /> },
                  { id: 'strategies', label: 'Strategies', count: strategies.length, icon: <Target className="w-4 h-4" /> },
                ]}
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
              />

              {/* Transactions Tab */}
              {activeTab === 'transactions' && (
                <div>
                  {/* Show Hidden Toggle */}
                  {hiddenTxKeys.size > 0 && (
                    <div className="flex justify-end px-4 pt-3">
                      <button
                        onClick={() => setShowHidden(!showHidden)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          showHidden 
                            ? 'bg-[#58A6FF] text-[#0D1117]' 
                            : 'bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]'
                        }`}
                      >
                        {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {showHidden ? 'Showing Hidden' : `Show ${hiddenTxKeys.size} Hidden`}
                      </button>
                    </div>
                  )}
                  <TransactionListSortable 
                    transactions={filteredTransactions}
                    tokenDict={tokenDict}
                    projectDict={projectDict}
                    chainNames={chainNames}
                    hiddenTxKeys={hiddenTxKeys}
                    showHidden={showHidden}
                    onHide={handleHide}
                    onUnhide={handleUnhide}
                    title=""
                    emptyMessage="No transactions found for this wallet"
                  />
                </div>
              )}

              {/* Positions Tab */}
              {activeTab === 'positions' && (
                <div className="p-4 space-y-4">
                  {positionSuggestions.length > 0 && (
                    <PositionSuggestionsPanel
                      suggestions={positionSuggestions}
                      projectDict={projectDict}
                      chainNames={chainNames}
                      onCreatePosition={handleCreatePosition}
                    />
                  )}
                  {positions.length > 0 ? (
                    <PositionsStrategiesPanel
                      positions={positions}
                      strategies={[]}
                      chainNames={chainNames}
                      onCreateStrategy={() => {}}
                      onDeletePosition={handleDeletePosition}
                      onDeleteStrategy={() => {}}
                    />
                  ) : (
                    <div className="text-center py-8 text-[#8B949E]">
                      <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No positions created yet</p>
                      <p className="text-sm mt-1">Create positions from transactions to track your DeFi activity</p>
                    </div>
                  )}
                </div>
              )}

              {/* Strategies Tab */}
              {activeTab === 'strategies' && (
                <div className="p-4">
                  {strategies.length > 0 ? (
                    <PositionsStrategiesPanel
                      positions={[]}
                      strategies={strategies}
                      chainNames={chainNames}
                      onCreateStrategy={() => setShowCreateStrategyModal(true)}
                      onDeletePosition={() => {}}
                      onDeleteStrategy={handleDeleteStrategy}
                    />
                  ) : (
                    <div className="text-center py-8 text-[#8B949E]">
                      <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No strategies created yet</p>
                      <p className="text-sm mt-1">Group positions into strategies for portfolio analysis</p>
                      <button
                        onClick={() => setShowCreateStrategyModal(true)}
                        className="mt-4 px-4 py-2 bg-[#238636] text-white rounded-lg hover:bg-[#2ea043] transition-colors"
                      >
                        Create Strategy
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-12 text-center">
            <FileCheck2 className="w-16 h-16 text-[#58A6FF] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">Transaction Reconciliation</h2>
            <p className="text-[#8B949E] max-w-md mx-auto">
              Discover all DeFi transactions across all chains.
            </p>
            <p className="text-[#8B949E] text-sm mt-4">Click "Load" to discover transactions.</p>
          </div>
        )}
      </main>

      {/* Create Position Modal */}
      {reconciliationStore && (
        <CreatePositionModal
          isOpen={showCreatePositionModal}
          onClose={() => {
            setShowCreatePositionModal(false);
            setSelectedSuggestion(null);
          }}
          onSave={handlePositionSave}
          suggestion={selectedSuggestion || undefined}
          store={reconciliationStore}
          projectDict={projectDict}
          chainNames={chainNames}
        />
      )}

      {/* Create Strategy Modal */}
      {reconciliationStore && (
        <CreateStrategyModal
          isOpen={showCreateStrategyModal}
          onClose={() => setShowCreateStrategyModal(false)}
          onSave={handleStrategySave}
          store={reconciliationStore}
        />
      )}
    </div>
  );
}
