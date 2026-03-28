"use client";

/**
 * Compatibility hook: bridges Privy wallets → same interface as @solana/wallet-adapter-react.
 * All components import from here instead of wallet-adapter.
 */

import { useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as usePrivyWallets } from "@privy-io/react-auth/solana";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

/** Helius free-tier devnet RPC */
export const HELIUS_DEVNET_RPC =
  "https://devnet.helius-rpc.com/?api-key=2cf03460-f790-4350-a211-18086a3a3fd2";

/** Shared connection (devnet via Helius) */
let _sharedConnection: Connection | null = null;
export function getSharedConnection(): Connection {
  if (!_sharedConnection) {
    _sharedConnection = new Connection(HELIUS_DEVNET_RPC, "confirmed");
  }
  return _sharedConnection;
}

/**
 * Drop-in replacement for `useWallet()` from @solana/wallet-adapter-react.
 * Returns { publicKey, connected, signTransaction, signAllTransactions, wallet }
 */
export function useWallet() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = usePrivyWallets();

  // Pick the first Solana wallet (embedded or external)
  const solanaWallet = wallets.length > 0 ? wallets[0] : null;

  const publicKey = useMemo(() => {
    if (!solanaWallet?.address) return null;
    try {
      return new PublicKey(solanaWallet.address);
    } catch {
      return null;
    }
  }, [solanaWallet?.address]);

  const connected = ready && authenticated && !!publicKey;

  const signTransaction = useMemo(() => {
    if (!solanaWallet) return undefined;
    return async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      let serialized: Uint8Array;
      if (tx instanceof Transaction) {
        serialized = new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
      } else {
        serialized = new Uint8Array(tx.serialize());
      }
      const result = await solanaWallet.signTransaction!({
        transaction: serialized,
      });
      // Deserialize back
      if (tx instanceof Transaction) {
        return Transaction.from(Buffer.from(result.signedTransaction)) as T;
      }
      return VersionedTransaction.deserialize(Buffer.from(result.signedTransaction)) as T;
    };
  }, [solanaWallet]);

  const signAllTransactions = useMemo(() => {
    if (!signTransaction) return undefined;
    return async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      const results: T[] = [];
      for (const tx of txs) {
        results.push(await signTransaction(tx));
      }
      return results;
    };
  }, [signTransaction]);

  return {
    publicKey,
    connected,
    signTransaction,
    signAllTransactions,
    wallet: solanaWallet,
    login,
    logout,
    ready,
    authenticated,
    user,
  };
}

/**
 * Drop-in replacement for `useConnection()` from @solana/wallet-adapter-react.
 */
export function useConnection() {
  const connection = useMemo(() => getSharedConnection(), []);
  return { connection };
}

/**
 * Drop-in replacement for `useAnchorWallet()` from @solana/wallet-adapter-react.
 * Returns a wallet object compatible with Anchor's `AnchorProvider`.
 */
export function useAnchorWallet() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  return useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    return {
      publicKey,
      signTransaction,
      signAllTransactions,
    };
  }, [publicKey, signTransaction, signAllTransactions]);
}
