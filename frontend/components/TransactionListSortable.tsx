"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { type Transaction, type TokenMeta, type ProjectMeta } from "@/lib/api";
import { TransactionRowCompact } from "./TransactionRowCompact";
import { getTxKey } from "@/lib/reconciliation/storage";
import type { Position } from "@/lib/reconciliation/positions";
import { getTransactionSuggestion } from "@/lib/reconciliation/naming";

type SortDirection = 'asc' | 'desc' | null;
type SortColumn = 'date' | 'chain' | 'type' | 'protocol' | 'amount' | 'position';

interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

interface TransactionListProps {
  transactions: Transaction[];
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
  positions: Position[];
  txPositionMap: Record<string, string>; // txKey -> positionId
  hiddenTxKeys?: Set<string>;
  showHidden?: boolean;
  onHide?: (chain: string, txHash: string) => void;
  onUnhide?: (chain: string, txHash: string) => void;
  onAssignPosition?: (chain: string, txHash: string, positionId: string) => void;
  onCreatePosition?: (chain: string, txHash: string, name: string) => void;
  onUnassignPosition?: (chain: string, txHash: string) => void;
  title?: string;
  emptyMessage?: string;
}

function calculateTxValue(tx: Transaction, tokenDict: Record<string, TokenMeta>): number {
  let total = 0;
  for (const recv of tx.receives || []) {
    const token = tokenDict[recv.token_id];
    if (token?.price) total += recv.amount * token.price;
  }
  for (const send of tx.sends || []) {
    const token = tokenDict[send.token_id];
    if (token?.price) total -= send.amount * token.price;
  }
  return total;
}

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
  positions,
  txPositionMap,
  hiddenTxKeys = new Set(),
  showHidden = false,
  onHide,
  onUnhide,
  onAssignPosition,
  onCreatePosition,
  onUnassignPosition,
  title = "Transactions",
  emptyMessage = "No transactions found"
}: TransactionListProps) {
  const [sort, setSort] = useState<SortState>({ column: 'date', direction: 'desc' });
  
  const handleSort = (column: SortColumn) => {
    setSort(prev => {
      if (prev.column === column) {
        if (prev.direction === 'desc') return { column, direction: 'asc' };
        if (prev.direction === 'asc') return { column: null, direction: null };
        return { column, direction: 'desc' };
      }
      return { column, direction: 'desc' };
    });
  };

  const sortedTransactions = useMemo(() => {
    let filtered = showHidden 
      ? transactions 
      : transactions.filter(tx => !hiddenTxKeys.has(getTxKey(tx.chain, tx.id)));
    
    if (sort.column && sort.direction) {
      const dir = sort.direction === 'asc' ? 1 : -1;
      
      filtered = [...filtered].sort((a, b) => {
        switch (sort.column) {
          case 'date':
            return (a.time_at - b.time_at) * dir;
          case 'chain':
            return (chainNames[a.chain] || a.chain).localeCompare(chainNames[b.chain] || b.chain) * dir;
          case 'type':
            return (a.cate_id || a.tx?.name || '').localeCompare(b.cate_id || b.tx?.name || '') * dir;
          case 'protocol':
            return (projectDict[a.project_id || '']?.name || '').localeCompare(projectDict[b.project_id || '']?.name || '') * dir;
          case 'amount':
            return (calculateTxValue(a, tokenDict) - calculateTxValue(b, tokenDict)) * dir;
          case 'position':
            const posA = positions.find(p => p.id === txPositionMap[getTxKey(a.chain, a.id)])?.name || '';
            const posB = positions.find(p => p.id === txPositionMap[getTxKey(b.chain, b.id)])?.name || '';
            return posA.localeCompare(posB) * dir;
          default:
            return 0;
        }
      });
    }
    return filtered;
  }, [transactions, hiddenTxKeys, showHidden, sort, chainNames, projectDict, tokenDict, positions, txPositionMap]);
  
  const hiddenCount = hiddenTxKeys.size;
  const assignedCount = sortedTransactions.filter(tx => txPositionMap[getTxKey(tx.chain, tx.id)]).length;
  const unassignedCount = sortedTransactions.length - assignedCount;
  
  if (sortedTransactions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[#8B949E]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with stats */}
      {title && (
        <div className="px-4 py-3 border-b border-[#21262D] flex items-center justify-between">
          <h3 className="text-[#E6EDF3] font-semibold">{title}</h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#3FB950]">{assignedCount} assigned</span>
            <span className="text-[#F0B90B]">{unassignedCount} unassigned</span>
            {hiddenCount > 0 && <span className="text-[#8B949E]">{hiddenCount} hidden</span>}
          </div>
        </div>
      )}
      
      {/* Column headers */}
      <div className="px-4 py-2 border-b border-[#21262D] bg-[#0D1117] flex items-center gap-3">
        <SortableHeader label="Date" column="date" currentSort={sort} onSort={handleSort} className="w-20" />
        <SortableHeader label="Chain" column="chain" currentSort={sort} onSort={handleSort} className="w-16" />
        <SortableHeader label="Type" column="type" currentSort={sort} onSort={handleSort} className="w-24" />
        <SortableHeader label="Protocol" column="protocol" currentSort={sort} onSort={handleSort} className="w-24" />
        <span className="w-40 text-xs font-medium uppercase tracking-wide text-[#8B949E]">Tokens</span>
        <SortableHeader label="Amount" column="amount" currentSort={sort} onSort={handleSort} className="w-20 justify-end" />
        <SortableHeader label="Position" column="position" currentSort={sort} onSort={handleSort} className="flex-1 min-w-[140px]" />
        <span className="w-8" />
      </div>
      
      {/* Transaction rows */}
      <div className="divide-y divide-[#21262D]">
        {sortedTransactions.map((tx, idx) => {
          const txKey = getTxKey(tx.chain, tx.id);
          const suggestion = getTransactionSuggestion(tx, positions, tokenDict);
          
          return (
            <TransactionRowCompact 
              key={`${tx.id}-${idx}`} 
              transaction={tx}
              tokenDict={tokenDict}
              projectDict={projectDict}
              chainNames={chainNames}
              isHidden={hiddenTxKeys.has(txKey)}
              positionId={txPositionMap[txKey]}
              suggestion={suggestion}
              onHide={onHide}
              onUnhide={onUnhide}
              onAssignPosition={onAssignPosition}
              onCreatePosition={onCreatePosition}
              onUnassignPosition={onUnassignPosition}
            />
          );
        })}
      </div>
    </div>
  );
}
