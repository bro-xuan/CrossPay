import { formatUnits } from "viem";
import { base, arbitrum } from "viem/chains";

// Define the chain type based on the chains we support
type SupportedChain = typeof base | typeof arbitrum;

interface ChainBalanceProps {
  chain: SupportedChain;
  balance: bigint;
}

export const ChainBalance = ({ chain, balance }: ChainBalanceProps) => {
  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h3 className="font-medium text-lg">{chain.name}</h3>
      <p className="text-gray-600 mt-1">{formatUnits(balance, 6)} USDC</p>
    </div>
  );
};
