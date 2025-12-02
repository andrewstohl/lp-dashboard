"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { type Transaction, type TokenMeta, type ProjectMeta } from "@/lib/api";
import { calculateTxValues } from "@/lib/transaction-filters";
import { TransactionRowCompact } from "./TransactionRowCompact";
import { getTxKey } from "@/lib/reconciliation/storage";

// Sort direction type
type SortDirection = 'asc' | 'desc' | null;

// Sortable column keys
type SortColumn = 'date' | 'chain' | 'type' | 'protocol' | 'amount';

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

interface TransactionListProps {
  transactions: Transaction[];
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
  hiddenTxKeys?: Set<string>;
  showHidden?: boolean;
  onHide?: (chain: string, txHash: string) => void;
  onUnhide?: (chain: string, txHash: string) => void;
  title?: string;
  emptyMessage?: string;
}

// Calculate USD value for a transaction (uses historical prices when available)
function calculateTxValue(tx: Transaction, tokenDict: Record<string, TokenMeta>): number {
  const { netValue } = calculateTxValues(tx, tokenDict);
  return netValue;
}

// Column header component with sort indicator
function SortableHeader({ 
  label, 
  column, 
  currentSort, 
  onSort,
  className = ""
}: { 
  label: string; 
  column: SortColumn; 
  currentSort: SortState;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = currentSort.column === column;
  const direction = isActive ? currentSort.direction : null;
  
  return (
    <button
      onClick={() => onSort(column)}
      className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-[#E6EDF3] transition-colors ${
        isActive ? 'text-[#58A6FF]' : 'text-[#8B949E]'
      } ${className}`}
    >
      {label}
      <span className="w-4 h-4 flex items-center justify-center">
        {direction === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : direction === 'desc' ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-50" />
        )}
      </span>
    </button>
  );
}

export function TransactionListSortable({ 
  transactions, 
  tokenDict,
  projectDict,
  chainNames,
  hiddenTxKeys = new Set(),
  showHidden = false,
  onHide,
  onUnhide,
  title = "Transactions",
  emptyMessage = "No transactions found"
}: TransactionListProps) {
  // Sort state - default to date descending (newest first)
  const [sort, setSort] = useState<SortState>({ column: 'date', direction: 'desc' });
  
  // Handle sort toggle
  const handleSort = (column: SortColumn) => {
    setSort(prev => {
      if (prev.column === column) {
        // Cycle: desc -> asc -> null -> desc
        if (prev.direction === 'desc') return { column, direction: 'asc' };
        if (prev.direction === 'asc') return { column: null, direction: null };
        return { column, direction: 'desc' };
      }
      // New column, start with desc
      return { column, direction: 'desc' };
    });
  };

  // Filter and sort transactions
  const sortedTransactions = useMemo(() => {
    // First filter
    let filtered = showHidden 
      ? transactions 
      : transactions.filter(tx => !hiddenTxKeys.has(getTxKey(tx.chain, tx.id)));
    
    // Then sort
    if (sort.column && sort.direction) {
      const dir = sort.direction === 'asc' ? 1 : -1;
      
      filtered = [...filtered].sort((a, b) => {
        switch (sort.column) {
          case 'date':
            return (a.time_at - b.time_at) * dir;
          
          case 'chain':
            const chainA = chainNames[a.chain] || a.chain;
            const chainB = chainNames[b.chain] || b.chain;
            return chainA.localeCompare(chainB) * dir;
          
          case 'type':
            const typeA = a.cate_id || a.tx?.name || '';
            const typeB = b.cate_id || b.tx?.name || '';
            return typeA.localeCompare(typeB) * dir;
          
          case 'protocol':
            const protoA = projectDict[a.project_id || '']?.name || a.project_id || '';
            const protoB = projectDict[b.project_id || '']?.name || b.project_id || '';
            return protoA.localeCompare(protoB) * dir;
          
          case 'amount':
            const valA = calculateTxValue(a, tokenDict);
            const valB = calculateTxValue(b, tokenDict);
            return (valA - valB) * dir;
          
          default:
            return 0;
        }
      });
    }
    
    return filtered;
  }, [transactions, hiddenTxKeys, showHidden, sort, chainNames, projectDict, tokenDict]);
  
  const hiddenCount = transactions.length - (showHidden 
    ? transactions.length 
    : transactions.filter(tx => !hiddenTxKeys.has(getTxKey(tx.chain, tx.id))).length);
  
  if (sortedTransactions.length === 0) {
    return (
      <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-8 text-center">
        <p className="text-[#8B949E]">{emptyMessage}</p>
        {hiddenCount > 0 && (
          <p className="text-[#8B949E] text-sm mt-2">
            ({hiddenCount} hidden transaction{hiddenCount !== 1 ? 's' : ''})
          </p>
        )}
      </div>
    );
  }


  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D]">
      {/* Header with title and count */}
      <div className="px-4 py-3 border-b border-[#21262D] flex items-center justify-between">
        <h3 className="text-[#E6EDF3] font-semibold">{title}</h3>
        <div className="flex items-center gap-3">
          {hiddenCount > 0 && (
            <span className="text-[#8B949E] text-sm">
              {hiddenCount} hidden
            </span>
          )}
          <span className="text-[#8B949E] text-sm">
            {sortedTransactions.length} transaction{sortedTransactions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      {/* Column headers */}
      <div className="px-4 py-2 border-b border-[#21262D] bg-[#0D1117] flex items-center gap-4">
        <SortableHeader 
          label="Date" 
          column="date" 
          currentSort={sort} 
          onSort={handleSort}
          className="w-24"
        />
        <SortableHeader 
          label="Chain" 
          column="chain" 
          currentSort={sort} 
          onSort={handleSort}
          className="w-20"
        />
        <SortableHeader 
          label="Type" 
          column="type" 
          currentSort={sort} 
          onSort={handleSort}
          className="w-28"
        />
        <SortableHeader 
          label="Protocol" 
          column="protocol" 
          currentSort={sort} 
          onSort={handleSort}
          className="w-28"
        />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-[#8B949E]">
          Tokens
        </span>
        <SortableHeader 
          label="Amount" 
          column="amount" 
          currentSort={sort} 
          onSort={handleSort}
          className="w-24 justify-end"
        />
        <span className="w-10 text-xs font-medium uppercase tracking-wide text-[#8B949E] text-right">
          
        </span>
      </div>
      
      {/* Transaction rows */}
      <div className="divide-y divide-[#21262D]">
        {sortedTransactions.map((tx, idx) => (
          <TransactionRowCompact 
            key={`${tx.id}-${idx}`} 
            transaction={tx}
            tokenDict={tokenDict}
            projectDict={projectDict}
            chainNames={chainNames}
            isHidden={hiddenTxKeys.has(getTxKey(tx.chain, tx.id))}
            onHide={onHide}
            onUnhide={onUnhide}
          />
        ))}
      </div>
    </div>
  );
}
