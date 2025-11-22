'use client';

import { useState } from 'react';

interface WalletInputProps {
  onSubmit: (address: string) => void;
  loading: boolean;
}

export default function WalletInput({ onSubmit, loading }: WalletInputProps) {
  const [address, setAddress] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onSubmit(address.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <label htmlFor="wallet" className="block text-sm font-medium text-gray-700 mb-2">
          Enter Ethereum Wallet Address
        </label>
        <div className="flex gap-3">
          <input
            id="wallet"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Loading...' : 'Analyze'}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          View your Uniswap v3 liquidity provider positions
        </p>
      </div>
    </form>
  );
}
