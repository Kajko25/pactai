"use client";

import { RainbowKitProvider, connectorsForWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { arcTestnet } from "@/lib/chain";
import { DEFAULT_RPC_URL } from "@/lib/deployments";

import "@rainbow-me/rainbowkit/styles.css";

// Wallet list is deliberately narrow: a browser-injected wallet (MetaMask,
// Rabby, Brave) and — only when a WalletConnect project id is configured —
// WalletConnect. No passkey/smart-wallet connectors: Arc Testnet has no
// bundler for them here, and the whole point of the demo is a plain EOA
// standing in for a human next to the agents' own wallets.
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Connect",
      wallets: wcProjectId ? [injectedWallet, walletConnectWallet] : [injectedWallet],
    },
  ],
  {
    appName: "PactAI",
    projectId: wcProjectId ?? "pactai-injected-only",
  },
);

const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(process.env.NEXT_PUBLIC_ARC_RPC_URL ?? DEFAULT_RPC_URL, {
      batch: true,
      retryCount: 3,
      retryDelay: 400,
    }),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, retry: 2 } },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={arcTestnet}
          theme={darkTheme({ accentColor: "#4d9fff", borderRadius: "medium" })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
