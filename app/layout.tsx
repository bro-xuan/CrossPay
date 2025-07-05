import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PrivyProvider } from "@privy-io/react-auth";
import { base, arbitrum } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const inter = Inter({ subsets: ["latin"] });
const queryClient = new QueryClient();

export const metadata: Metadata = {
  title: "USDC Aggregator",
  description: "Aggregate USDC across multiple chains",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
          config={{
            defaultChain: base,
            supportedChains: [base, arbitrum],
            appearance: {
              theme: "light",
              accentColor: "#3a0ca3",
            },
            // Privy automatically configures Wagmi for us
          }}
        >
          <QueryClientProvider client={queryClient}>
            <main className="container mx-auto p-4">{children}</main>
          </QueryClientProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
