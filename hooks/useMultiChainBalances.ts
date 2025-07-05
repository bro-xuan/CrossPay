import { useBalance } from "wagmi";
import { base, arbitrum } from "viem/chains";
import { Address, formatUnits } from "viem";
import { useMemo } from "react";

// Define supported chains with their USDC addresses
const SUPPORTED_CHAINS = {
  [base.id]: {
    chain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  },
  [arbitrum.id]: {
    chain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
  },
} as const;

export const useMultiChainBalances = (address?: Address) => {
  // Create individual balance queries with proper wagmi v1+ syntax
  const baseQuery = useBalance({
    address,
    chainId: base.id,
    token: SUPPORTED_CHAINS[base.id].usdcAddress,
    query: {
      enabled: !!address,
    },
  });

  const arbitrumQuery = useBalance({
    address,
    chainId: arbitrum.id,
    token: SUPPORTED_CHAINS[arbitrum.id].usdcAddress,
    query: {
      enabled: !!address,
    },
  });

  // Combine results using useMemo for optimization
  const { balances, formattedBalances, isLoading, isError } = useMemo(() => {
    const balances = {
      [base.id]: baseQuery.data?.value ?? BigInt(0),
      [arbitrum.id]: arbitrumQuery.data?.value ?? BigInt(0),
    };

    const formattedBalances = {
      [base.id]: {
        value: balances[base.id],
        formatted: formatUnits(balances[base.id], 6),
        chain: base,
      },
      [arbitrum.id]: {
        value: balances[arbitrum.id],
        formatted: formatUnits(balances[arbitrum.id], 6),
        chain: arbitrum,
      },
    };

    return {
      balances,
      formattedBalances,
      isLoading: baseQuery.isLoading || arbitrumQuery.isLoading,
      isError: baseQuery.isError || arbitrumQuery.isError,
    };
  }, [
    baseQuery.data?.value,
    arbitrumQuery.data?.value,
    baseQuery.isLoading,
    arbitrumQuery.isLoading,
    baseQuery.isError,
    arbitrumQuery.isError,
  ]);

  return {
    balances,
    formattedBalances,
    isLoading,
    isError,
    refetch: () => {
      baseQuery.refetch();
      arbitrumQuery.refetch();
    },
  };
};
