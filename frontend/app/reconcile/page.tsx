"use client";

import { useState } from "react";
import { Wallet, Search, FileCheck2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";

export default function ReconcilePage() {
  const [walletAddress, setWalletAddress] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastWalletAddress') || '0x23b50a703d3076b73584df48251931ebf5937ba2';
    }
    return '0x23b50a703d3076b73584df48251931ebf5937ba2';
  });

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Will be implemented in Step 8
    console.log("Fetching transactions for:", walletAddress);
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <header className="bg-[#161B22] border-b border-[#21262D] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#58A6FF]" />
              <h1 className="text-2xl font-bold text-[#E6EDF3]">VORA Dashboard</h1>
            </div>
            <Navigation />
          </div>

          {/* Search Form */}
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
                className="px-6 py-3 bg-[#58A6FF] text-[#0D1117] font-semibold rounded-lg hover:bg-[#79B8FF] transition-colors"
              >
                Load
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* Main Content - Placeholder */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Placeholder content */}
        <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-12 text-center">
          <FileCheck2 className="w-16 h-16 text-[#58A6FF] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">
            Transaction Reconciliation
          </h2>
          <p className="text-[#8B949E] max-w-md mx-auto">
            Organize your DeFi transactions into Positions and Strategies. 
            Track P&L across coordinated trades.
          </p>
          <p className="text-[#8B949E] text-sm mt-4">
            Coming soon: Transaction list, allocation controls, and smart suggestions.
          </p>
        </div>
      </main>
    </div>
  );
}
