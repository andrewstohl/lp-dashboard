"use client";

import { useState, useEffect } from "react";
import { X, Plus, FolderKanban, Percent, Trash2 } from "lucide-react";
import {
  type Strategy,
  type PositionAllocation,
  STRATEGY_TYPES,
  createStrategy,
  ensureStrategyStore,
} from "@/lib/reconciliation/strategies";
import { type Position, getPositions, ensurePositionStore } from "@/lib/reconciliation/positions";
import { type ReconciliationStore } from "@/lib/reconciliation/storage";

interface CreateStrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (strategy: Strategy) => void;
  store: ReconciliationStore;
  
  // Optional: pre-select positions
  selectedPositionIds?: string[];
}

export function CreateStrategyModal({
  isOpen,
  onClose,
  onSave,
  store,
  selectedPositionIds = [],
}: CreateStrategyModalProps) {
  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<Strategy['type']>("delta_neutral");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  
  // Position allocations
  const [allocations, setAllocations] = useState<PositionAllocation[]>([]);
  
  // Available positions
  const [availablePositions, setAvailablePositions] = useState<Position[]>([]);

  // Initialize form
  useEffect(() => {
    const storeWithPositions = ensurePositionStore(store);
    const positions = getPositions(storeWithPositions);
    setAvailablePositions(positions);
    
    // Pre-select positions if provided
    if (selectedPositionIds.length > 0) {
      setAllocations(
        selectedPositionIds.map(positionId => ({
          positionId,
          percentage: 100,
          addedAt: Date.now(),
        }))
      );
    }
  }, [store, selectedPositionIds]);
  
  // Add position to allocations
  const handleAddPosition = (positionId: string) => {
    if (allocations.some(a => a.positionId === positionId)) return;
    
    setAllocations([
      ...allocations,
      {
        positionId,
        percentage: 100,
        addedAt: Date.now(),
      },
    ]);
  };
  
  // Remove position from allocations
  const handleRemovePosition = (positionId: string) => {
    setAllocations(allocations.filter(a => a.positionId !== positionId));
  };
  
  // Update allocation percentage
  const handleUpdatePercentage = (positionId: string, percentage: number) => {
    setAllocations(
      allocations.map(a =>
        a.positionId === positionId ? { ...a, percentage } : a
      )
    );
  };
  
  // Handle save
  const handleSave = () => {
    const storeWithStrategies = ensureStrategyStore(store);
    
    const result = createStrategy(storeWithStrategies, {
      name: name.trim() || "Unnamed Strategy",
      type,
      description: description.trim() || undefined,
      positions: allocations,
      notes: notes.trim() || undefined,
    });
    
    onSave(result.strategy);
    onClose();
  };
  
  // Get position by ID
  const getPositionById = (positionId: string) => 
    availablePositions.find(p => p.id === positionId);
  
  // Positions not yet added
  const unaddedPositions = availablePositions.filter(
    p => !allocations.some(a => a.positionId === p.id)
  );
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#161B22] rounded-lg border border-[#30363D] shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#21262D]">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[#A371F7]" />
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Create Strategy</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Body - scrollable */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Name input */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-1">
              Strategy Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Delta Neutral ETH"
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:ring-2 focus:ring-[#A371F7] focus:border-transparent"
            />
          </div>
          
          {/* Strategy Type */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-1">
              Strategy Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Strategy['type'])}
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] focus:outline-none focus:ring-2 focus:ring-[#A371F7] focus:border-transparent"
            >
              {STRATEGY_TYPES.map(st => (
                <option key={st.value} value={st.value}>
                  {st.label} - {st.description}
                </option>
              ))}
            </select>
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the strategy"
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:ring-2 focus:ring-[#A371F7] focus:border-transparent"
            />
          </div>

          {/* Position Allocations */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-2">
              Positions
            </label>
            
            {/* Current allocations */}
            {allocations.length > 0 ? (
              <div className="space-y-2 mb-3">
                {allocations.map(alloc => {
                  const position = getPositionById(alloc.positionId);
                  if (!position) return null;
                  
                  return (
                    <div
                      key={alloc.positionId}
                      className="flex items-center gap-3 p-3 bg-[#0D1117] rounded-lg border border-[#30363D]"
                    >
                      <div className="flex-1">
                        <p className="text-sm text-[#E6EDF3]">{position.name}</p>
                        <p className="text-xs text-[#8B949E]">
                          {position.protocolName || position.protocol} • {position.chain}
                        </p>
                      </div>
                      
                      {/* Percentage input */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={alloc.percentage}
                          onChange={(e) => handleUpdatePercentage(alloc.positionId, Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-[#21262D] border border-[#30363D] rounded text-[#E6EDF3] text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#A371F7]"
                        />
                        <Percent className="w-4 h-4 text-[#8B949E]" />
                      </div>
                      
                      {/* Remove button */}
                      <button
                        onClick={() => handleRemovePosition(alloc.positionId)}
                        className="p-1 text-[#8B949E] hover:text-[#F85149] transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[#8B949E] mb-3">No positions added yet</p>
            )}
            
            {/* Add position dropdown */}
            {unaddedPositions.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) handleAddPosition(e.target.value);
                }}
                className="w-full px-3 py-2 bg-[#21262D] border border-[#30363D] rounded-lg text-[#8B949E] focus:outline-none focus:ring-2 focus:ring-[#A371F7] focus:border-transparent"
              >
                <option value="">+ Add position...</option>
                {unaddedPositions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            
            {availablePositions.length === 0 && (
              <p className="text-xs text-[#8B949E]">
                Create positions first before adding them to a strategy.
              </p>
            )}
          </div>
          
          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-[#8B949E] mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this strategy..."
              rows={2}
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:ring-2 focus:ring-[#A371F7] focus:border-transparent resize-none"
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
            disabled={!name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-[#8957E5] text-white text-sm font-medium rounded-lg hover:bg-[#A371F7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Create Strategy
          </button>
        </div>
      </div>
    </div>
  );
}
