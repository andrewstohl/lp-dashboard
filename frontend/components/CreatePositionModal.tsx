"use client";

import { useState, useEffect } from "react";
import { X, Plus, Check, AlertCircle, Layers } from "lucide-react";
import type { Transaction, ProjectMeta } from "@/lib/api";
import { 
  type Position, 
  type PositionSuggestion,
  createPosition,
  generatePositionName,
  ensurePositionStore,
} from "@/lib/reconciliation/positions";
import { type ReconciliationStore, getTxKey } from "@/lib/reconciliation/storage";

interface CreatePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (position: Position) => void;
  
  // Pre-selected data (from suggestion or manual selection)
  suggestion?: PositionSuggestion;
  selectedTxKeys?: string[];
  selectedTransactions?: Transaction[];
  
  // Context
  store: ReconciliationStore;
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
}

export function CreatePositionModal({
  isOpen,
  onClose,
  onSave,
  suggestion,
  selectedTxKeys = [],
  selectedTransactions = [],
  store,
  projectDict,
  chainNames,
}: CreatePositionModalProps) {
  // Form state
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [chain, setChain] = useState("");
  const [protocol, setProtocol] = useState("");

  // Initialize form from suggestion or selections
  useEffect(() => {
    if (suggestion) {
      setChain(suggestion.chain);
      setProtocol(suggestion.protocol);
      setName(generatePositionName(
        suggestion.protocol,
        suggestion.protocolName,
        suggestion.tokenPair,
        suggestion.positionKey
      ));
    } else if (selectedTransactions.length > 0) {
      // Infer from first transaction
      const firstTx = selectedTransactions[0];
      setChain(firstTx.chain);
      setProtocol(firstTx.project_id || "");
      
      const protoName = projectDict[firstTx.project_id || ""]?.name;
      setName(protoName ? `${protoName} Position` : "New Position");
    } else {
      setName("New Position");
    }
  }, [suggestion, selectedTransactions, projectDict]);
  
  // Get transaction keys
  const txKeys = suggestion?.txKeys || selectedTxKeys;
  
  // Handle save
  const handleSave = () => {
    const storeWithPositions = ensurePositionStore(store);
    
    const result = createPosition(storeWithPositions, {
      name: name.trim() || "Unnamed Position",
      chain,
      protocol,
      protocolName: projectDict[protocol]?.name,
      positionKey: suggestion?.positionKey,
      tokenPair: suggestion?.tokenPair,
      txKeys,
      notes: notes.trim() || undefined,
    });
    
    onSave(result.position);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#161B22] rounded-lg border border-[#30363D] shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#21262D]">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#58A6FF]" />
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Create Position</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Suggestion info */}
          {suggestion && (
            <div className="flex items-start gap-3 p-3 bg-[#21262D] rounded-lg">
              <AlertCircle className={`w-5 h-5 mt-0.5 ${
                suggestion.confidence === 'high' ? 'text-[#3FB950]' :
                suggestion.confidence === 'medium' ? 'text-[#D29922]' :
                'text-[#8B949E]'
              }`} />
              <div>
                <p className="text-sm text-[#E6EDF3]">
                  Auto-detected {suggestion.transactionCount} related transactions
                </p>
                <p className="text-xs text-[#8B949E] mt-1">
                  Confidence: {suggestion.confidence} 
                  {suggestion.positionKey && ` • Position ID: ${suggestion.positionKey.slice(-8)}`}
                </p>
              </div>
            </div>
          )}
          
          {/* Name input */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-1">
              Position Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ETH/USDC LP #12345"
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:ring-2 focus:ring-[#58A6FF] focus:border-transparent"
            />
          </div>
          
          {/* Chain & Protocol (read-only if from suggestion) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#8B949E] mb-1">
                Chain
              </label>
              <div className="px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3]">
                {chainNames[chain] || chain || "—"}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#8B949E] mb-1">
                Protocol
              </label>
              <div className="px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3]">
                {projectDict[protocol]?.name || protocol || "—"}
              </div>
            </div>
          </div>
          
          {/* Transaction count */}
          <div className="flex items-center gap-2 p-3 bg-[#0D1117] rounded-lg border border-[#30363D]">
            <Check className="w-4 h-4 text-[#3FB950]" />
            <span className="text-sm text-[#E6EDF3]">
              {txKeys.length} transaction{txKeys.length !== 1 ? 's' : ''} will be linked
            </span>
          </div>
          
          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this position..."
              rows={2}
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:ring-2 focus:ring-[#58A6FF] focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#21262D]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={txKeys.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-[#238636] text-white text-sm font-medium rounded-lg hover:bg-[#2ea043] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Create Position
          </button>
        </div>
      </div>
    </div>
  );
}
