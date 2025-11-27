"use client";

import { useState } from "react";
import { X, Plus, Minus } from "lucide-react";

interface Position {
  id: string;
  displayName?: string;
  name: string;
  valueUsd: number;
  status: "open" | "closed";
  type: string;
  chain: string;
}

interface PositionAllocation {
  positionId: string;
  percentage: number;
}

interface CreateStrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (strategy: {
    name: string;
    description?: string;
    positions: PositionAllocation[];
  }) => void;
  availablePositions: Position[];
}

export function CreateStrategyModal({
  isOpen,
  onClose,
  onSubmit,
  availablePositions,
}: CreateStrategyModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<PositionAllocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddPosition = (positionId: string) => {
    if (selectedPositions.find((p) => p.positionId === positionId)) {
      return; // Already added
    }
    setSelectedPositions([...selectedPositions, { positionId, percentage: 100 }]);
  };

  const handleRemovePosition = (positionId: string) => {
    setSelectedPositions(selectedPositions.filter((p) => p.positionId !== positionId));
  };

  const handlePercentageChange = (positionId: string, percentage: number) => {
    setSelectedPositions(
      selectedPositions.map((p) =>
        p.positionId === positionId ? { ...p, percentage: Math.min(100, Math.max(0, percentage)) } : p
      )
    );
  };

  const handleSubmit = () => {
    setError(null);

    if (!name.trim()) {
      setError("Strategy name is required");
      return;
    }

    if (selectedPositions.length === 0) {
      setError("Add at least one position to the strategy");
      return;
    }

    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      positions: selectedPositions,
    });

    // Reset form
    setName("");
    setDescription("");
    setSelectedPositions([]);
    onClose();
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setSelectedPositions([]);
    setError(null);
    onClose();
  };

  const getPosition = (id: string) => availablePositions.find((p) => p.id === id);

  // Filter out already selected positions from dropdown
  const unselectedPositions = availablePositions.filter(
    (p) => !selectedPositions.find((sp) => sp.positionId === p.id)
  );

  // Calculate total value
  const totalValue = selectedPositions.reduce((sum, sp) => {
    const pos = getPosition(sp.positionId);
    return sum + (pos?.valueUsd || 0) * (sp.percentage / 100);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363D]">
          <h2 className="text-lg font-semibold text-[#E6EDF3]">Create Strategy</h2>
          <button
            onClick={handleClose}
            className="p-1 text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-[#F8514933] border border-[#F85149] rounded-lg text-sm text-[#F85149]">
              {error}
            </div>
          )}

          {/* Strategy Name */}
          <div>
            <label className="block text-sm font-medium text-[#E6EDF3] mb-1.5">
              Strategy Name <span className="text-[#F85149]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 Delta Neutral, ETH Flywheel"
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#E6EDF3] mb-1.5">
              Description <span className="text-[#8B949E]">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this strategy's goals..."
              rows={2}
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF] resize-none"
            />
          </div>

          {/* Position Selection */}
          <div>
            <label className="block text-sm font-medium text-[#E6EDF3] mb-1.5">
              Positions
            </label>

            {/* Add Position Dropdown */}
            {unselectedPositions.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddPosition(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] focus:outline-none focus:border-[#58A6FF] mb-3"
                defaultValue=""
              >
                <option value="" disabled>
                  + Add position to strategy...
                </option>
                {unselectedPositions.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.displayName || pos.name} (${pos.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                  </option>
                ))}
              </select>
            )}

            {/* Selected Positions */}
            {selectedPositions.length === 0 ? (
              <div className="p-4 bg-[#0D1117] border border-dashed border-[#30363D] rounded-lg text-center text-sm text-[#8B949E]">
                No positions selected. Add positions from the dropdown above.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedPositions.map((sp) => {
                  const pos = getPosition(sp.positionId);
                  if (!pos) return null;

                  const allocatedValue = pos.valueUsd * (sp.percentage / 100);

                  return (
                    <div
                      key={sp.positionId}
                      className="flex items-center gap-3 p-3 bg-[#0D1117] border border-[#30363D] rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#E6EDF3] truncate">
                          {pos.displayName || pos.name}
                        </div>
                        <div className="text-xs text-[#8B949E]">
                          ${allocatedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} of ${pos.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </div>

                      {/* Percentage Input */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePercentageChange(sp.positionId, sp.percentage - 10)}
                          className="p-1 text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] rounded"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          value={sp.percentage}
                          onChange={(e) => handlePercentageChange(sp.positionId, parseInt(e.target.value) || 0)}
                          min={0}
                          max={100}
                          className="w-14 px-2 py-1 bg-[#21262D] border border-[#30363D] rounded text-center text-sm text-[#E6EDF3] focus:outline-none focus:border-[#58A6FF]"
                        />
                        <span className="text-sm text-[#8B949E]">%</span>
                        <button
                          onClick={() => handlePercentageChange(sp.positionId, sp.percentage + 10)}
                          className="p-1 text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] rounded"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemovePosition(sp.positionId)}
                        className="p-1 text-[#F85149] hover:bg-[#F8514933] rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {selectedPositions.length > 0 && (
            <div className="p-3 bg-[#21262D] rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-[#8B949E]">Total Allocated Value</span>
                <span className="text-[#E6EDF3] font-medium">
                  ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-[#8B949E]">Positions</span>
                <span className="text-[#E6EDF3]">{selectedPositions.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#30363D]">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-[#E6EDF3] hover:bg-[#21262D] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || selectedPositions.length === 0}
            className="px-4 py-2 text-sm bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white rounded-lg transition-colors"
          >
            Create Strategy
          </button>
        </div>
      </div>
    </div>
  );
}
