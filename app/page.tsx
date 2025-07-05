"use client";
import { usePrivy } from "@privy-io/react-auth";
import AuthButtons from "@/components/auth/AuthButtons";

export default function Home() {
  const { ready, authenticated } = usePrivy();

  if (!ready) return <div className="spinner">Loading...</div>;

  return (
    <main>
      <h1>Smart Wallet Demo</h1>
      {authenticated ? (
        <div>
          <p>Connected!</p>
          <a href="/dashboard">Go to Dashboard</a>
        </div>
      ) : (
        <AuthButtons />
      )}
    </main>
  );
}
