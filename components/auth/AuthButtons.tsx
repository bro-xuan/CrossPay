"use client";
import { usePrivy } from "@privy-io/react-auth";

export default function AuthButtons() {
  const { login } = usePrivy();

  return (
    <button onClick={login} className="connect-button">
      Connect Smart Wallet
    </button>
  );
}
