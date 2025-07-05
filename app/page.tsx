"use client";
import { MultiWalletConnector } from "@/components/auth/wallets/MultiWalletConnector";
import { ChainBalance } from "@/components/auth/wallets/WalletBalanceDisplay";
import { useAccount } from "wagmi";
import { useMultiChainBalances } from "@/hooks/useMultiChainBalances";
import { base, arbitrum } from "viem/chains";

export default function Home() {
  const { address } = useAccount();
  const { formattedBalances } = useMultiChainBalances(address); // Removed unused isLoading

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">USDC Balance Viewer</h1>

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <MultiWalletConnector />
      </div>

      {address && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <ChainBalance
            chain={base}
            balance={formattedBalances[base.id]?.value || BigInt(0)}
          />
          <ChainBalance
            chain={arbitrum}
            balance={formattedBalances[arbitrum.id]?.value || BigInt(0)}
          />
        </div>
      )}
    </div>
  );
}
