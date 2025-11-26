"use client";

import { type Transaction, type TokenMeta, type ProjectMeta } from "@/lib/api";
import { TransactionRow } from "./TransactionRow";

interface TransactionListProps {
  transactions: Transaction[];
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
  title?: string;
  emptyMessage?: string;
}

export function TransactionList({ 
  transactions, 
  tokenDict,
  projectDict,
  chainNames,
  title = "Transactions",
  emptyMessage = "No transactions found"
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-8 text-center">
        <p className="text-[#8B949E]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#21262D] flex items-center justify-between">
        <h3 className="text-[#E6EDF3] font-semibold">{title}</h3>
        <span className="text-[#8B949E] text-sm">{transactions.length} transactions</span>
      </div>
      
      {/* Transaction rows */}
      <div className="divide-y divide-[#21262D]">
        {transactions.map((tx, idx) => (
          <TransactionRow 
            key={`${tx.id}-${idx}`} 
            transaction={tx}
            tokenDict={tokenDict}
            projectDict={projectDict}
            chainNames={chainNames}
          />
        ))}
      </div>
    </div>
  );
}
