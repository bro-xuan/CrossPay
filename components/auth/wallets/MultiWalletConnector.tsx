import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

export const MultiWalletConnector = () => {
  const { authenticated, user, login, logout } = usePrivy();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    if (user?.wallet?.address) {
      setWalletAddress(user.wallet.address);
    } else {
      setWalletAddress(null);
    }
  }, [user]);

  return (
    <div>
      {!authenticated ? (
        <button
          onClick={login}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Connect Wallets
        </button>
      ) : (
        <div className="space-y-2">
          {walletAddress ? (
            <div className="flex items-center space-x-2">
              <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                {`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <p className="text-yellow-600">
              Wallet connected but address not available
            </p>
          )}
        </div>
      )}
    </div>
  );
};
