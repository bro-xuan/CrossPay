"use client";
import { useWallets } from "@privy-io/react-auth";

export default function Dashboard() {
  const { wallets } = useWallets();
  const smartWallet = wallets.find((w) => w.walletClientType === "privy");

  return (
    <div>
      <h2>Wallet Connection Test</h2>
      {smartWallet ? (
        <div>
          <p>✅ Smart Wallet Connected</p>
          <p>Address: {smartWallet.address}</p>
          <p>Chain ID: {smartWallet.chainId}</p>
        </div>
      ) : (
        <p>❌ No smart wallet detected</p>
      )}
    </div>
  );
}
