"use client";

import { type Transaction, type TokenMeta, type ProjectMeta } from "@/lib/api";
import { TransactionRow } from "./TransactionRow";
import { getTxKey } from "@/lib/reconciliation/storage";

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

export function TransactionList({ 
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
  
  // Filter out hidden transactions unless showHidden is true
  const visibleTransactions = showHidden 
    ? transactions 
    : transactions.filter(tx => !hiddenTxKeys.has(getTxKey(tx.chain, tx.id)));
  
  const hiddenCount = transactions.length - visibleTransactions.length;
  
  if (visibleTransactions.length === 0) {
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
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#21262D] flex items-center justify-between">
        <h3 className="text-[#E6EDF3] font-semibold">{title}</h3>
        <div className="flex items-center gap-3">
          {hiddenCount > 0 && (
            <span className="text-[#8B949E] text-sm">
              {hiddenCount} hidden
            </span>
          )}
          <span className="text-[#8B949E] text-sm">
            {visibleTransactions.length} transaction{visibleTransactions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      {/* Transaction rows */}
      <div className="divide-y divide-[#21262D]">
        {visibleTransactions.map((tx, idx) => (
          <TransactionRow 
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
