// src/context/PrivyProvider.tsx
"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { base } from "viem/chains";
import type { PrivyClientConfig } from "@privy-io/react-auth";

const config: PrivyClientConfig = {
  appearance: {
    theme: "light",
    accentColor: "#4F46E5",
  },
  defaultChain: base,
  supportedChains: [base],
  embeddedWallets: {
    requireUserPasswordOnCreate: false,
  },
  // smartWallets is not a direct property of PrivyClientConfig
};

export function CustomPrivyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={config}
    >
      {children}
    </PrivyProvider>
  );
}
