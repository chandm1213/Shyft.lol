"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

const HELIUS_DEVNET = "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

const solanaRpcs = {
  "solana:devnet": {
    rpc: createSolanaRpc(HELIUS_DEVNET),
    rpcSubscriptions: createSolanaRpcSubscriptions("wss://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2"),
    blockExplorerUrl: "https://explorer.solana.com/?cluster=devnet",
  },
  "solana:mainnet": {
    rpc: createSolanaRpc("https://mainnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2"),
    rpcSubscriptions: createSolanaRpcSubscriptions("wss://mainnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2"),
    blockExplorerUrl: "https://explorer.solana.com",
  },
} as const;

export default function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cmn36w5d1008c0cjmqphxqth6"
      config={{
        appearance: {
          theme: "light",
          accentColor: "#2563EB",
          logo: "/favicon.svg",
          landingHeader: "Welcome to Shyft",
          loginMessage: "Sign in to access private social on Solana",
          walletChainType: "solana-only",
          walletList: ["phantom", "solflare", "backpack", "detected_solana_wallets"],
        },
        loginMethods: ["email", "google", "twitter", "github", "wallet"],
        solana: {
          rpcs: solanaRpcs,
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
