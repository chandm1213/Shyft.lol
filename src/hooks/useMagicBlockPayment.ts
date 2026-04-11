"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet, pollConfirmation } from "@/hooks/usePrivyWallet";
import { PublicKey, Transaction, VersionedTransaction, Connection } from "@solana/web3.js";
import { useAppStore } from "@/lib/store";

/**
 * MagicBlock Private Payments API
 * Docs: https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/api-reference/per/transfer
 *
 * User-to-user USDC transfers via MagicBlock's ephemeral rollup (TEE-based privacy).
 * User pays everything — no treasury involvement.
 *
 * Flow:
 *   1. POST /v1/spl/transfer → get unsigned tx (base64)
 *   2. Deserialize → user signs
 *   3. Send to Solana (base chain or ephemeral based on `sendTo` response)
 */

const MAGICBLOCK_API = "https://payments.magicblock.app";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

// MagicBlock ephemeral rollup RPC (for sending to ephemeral when sendTo === "ephemeral")
const MAGICBLOCK_EPHEMERAL_RPC = "https://ephemeral.magicblock.app";

export type MagicBlockPaymentStep =
  | "idle"
  | "building"    // Requesting tx from MagicBlock API
  | "signing"     // User is signing the tx
  | "sending"     // Sending signed tx to chain
  | "confirming"  // Waiting for confirmation
  | "done"
  | "error";

export type PaymentVisibility = "public" | "private";

interface MagicBlockTransferResponse {
  transactionBase64: string;
  sendTo: "base" | "ephemeral";
  requiredSigners: string[];
  recentBlockhash: string;
  lastValidBlockHeight: number;
}

export function useMagicBlockPayment() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { addPayment } = useAppStore();
  const [step, setStep] = useState<MagicBlockPaymentStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const sendPrivatePayment = useCallback(
    async (recipientAddress: string, amount: number, visibility: PaymentVisibility = "private") => {
      if (!publicKey || !signTransaction) {
        setError("Wallet not connected");
        setStep("error");
        return null;
      }

      setStep("idle");
      setError(null);
      setTxSignature(null);

      try {
        // Validate recipient
        let recipientPubkey: PublicKey;
        try {
          recipientPubkey = new PublicKey(recipientAddress);
        } catch {
          throw new Error("Invalid recipient address");
        }

        // --- Step 1: Request unsigned tx from MagicBlock API ---
        setStep("building");
        console.log(`🔒 MagicBlock ${visibility} SOL transfer: ${amount} SOL to ${recipientAddress.slice(0, 8)}...`);

        // Amount in lamports (9 decimals for SOL)
        const lamports = Math.round(amount * 1_000_000_000);

        const basePay = {
          from: publicKey.toBase58(),
          to: recipientPubkey.toBase58(),
          mint: WSOL_MINT,
          amount: lamports,
          visibility,
          fromBalance: "base",
          toBalance: "base",
          cluster: "mainnet",
        };

        // Strategy: try with only ATA init (keeps tx small), then escalate if needed
        const attempts = [
          { ...basePay, initIfMissing: false, initAtasIfMissing: true, initVaultIfMissing: false },
          { ...basePay, initIfMissing: true, initAtasIfMissing: true, initVaultIfMissing: true },
        ];

        let apiRes: Response | null = null;
        let lastErr = "";

        for (const payload of attempts) {
          apiRes = await fetch(`${MAGICBLOCK_API}/v1/spl/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (apiRes.ok) break;

          lastErr = await apiRes.text();
          console.warn(`MagicBlock attempt failed (init=${payload.initIfMissing},ata=${payload.initAtasIfMissing},vault=${payload.initVaultIfMissing}):`, apiRes.status, lastErr);

          // If the error is TRANSACTION_TOO_LARGE on the full-init attempt, we can't fix it
          if (payload.initIfMissing && lastErr.includes("TRANSACTION_TOO_LARGE")) {
            throw new Error("Transaction too large — recipient may need to initialize their USDC account separately. Try a smaller amount or contact support.");
          }
        }

        if (!apiRes || !apiRes.ok) {
          throw new Error(`MagicBlock API error: ${lastErr}`);
        }

        const data: MagicBlockTransferResponse = await apiRes.json();
        console.log("📦 MagicBlock response:", { sendTo: data.sendTo, requiredSigners: data.requiredSigners });

        // --- Step 2: Deserialize and sign ---
        setStep("signing");

        const txBytes = Buffer.from(data.transactionBase64, "base64");

        // MagicBlock can return either legacy or versioned tx
        let signedTx: Transaction | VersionedTransaction;
        try {
          // Try versioned first
          const vTx = VersionedTransaction.deserialize(txBytes);
          signedTx = await signTransaction(vTx as any);
        } catch {
          // Fallback to legacy
          const legacyTx = Transaction.from(txBytes);
          signedTx = await signTransaction(legacyTx as any);
        }

        // --- Step 3: Send to appropriate chain ---
        setStep("sending");

        let sig: string;
        if (data.sendTo === "ephemeral") {
          // Send to MagicBlock ephemeral rollup
          console.log("📡 Sending to MagicBlock ephemeral rollup...");
          const ephemeralConnection = new Connection(MAGICBLOCK_EPHEMERAL_RPC, "confirmed");
          sig = await ephemeralConnection.sendRawTransaction(signedTx.serialize() as Buffer, {
            skipPreflight: true, // ephemeral doesn't support preflight
          });
        } else {
          // Send to Solana base chain
          console.log("📡 Sending to Solana base chain...");
          sig = await connection.sendRawTransaction(signedTx.serialize() as Buffer, {
            skipPreflight: false,
          });
        }

        // --- Step 4: Confirm ---
        setStep("confirming");
        console.log("⏳ Confirming tx:", sig);

        if (data.sendTo === "ephemeral") {
          // For ephemeral, we trust MagicBlock's confirmation
          // Wait a short time for the ephemeral rollup to process
          await new Promise((resolve) => setTimeout(resolve, 3000));
          console.log("✅ Ephemeral tx confirmed (MagicBlock):", sig);
        } else {
          await pollConfirmation(connection, sig);
          console.log("✅ Base chain tx confirmed:", sig);
        }

        setTxSignature(sig);
        setStep("done");

        addPayment({
          id: sig,
          sender: "me",
          recipient: recipientAddress,
          amount,
          token: "SOL",
          status: "completed",
          isPrivate: visibility === "private",
          timestamp: Date.now(),
          txSignature: sig,
        });

        return { transferSig: sig, sendTo: data.sendTo };
      } catch (err: any) {
        console.error("MagicBlock payment error:", err);
        setStep("error");

        // Parse common errors into user-friendly messages
        const raw = err?.message || "Private payment failed";
        let msg = raw;
        if (raw.includes("insufficient funds") || raw.includes("custom program error: 0x1")) {
          msg = "Insufficient SOL balance. Please add SOL to your wallet and try again.";
        } else if (raw.includes("User exited") || raw.includes("user rejected") || raw.includes("Failed to connect to wallet")) {
          msg = "Transaction cancelled.";
          setStep("idle"); // Not a real error — user just dismissed the modal
          return null;
        } else if (raw.includes("TRANSACTION_TOO_LARGE")) {
          msg = "Transaction too large. Try again — recipient accounts may need initialization.";
        }
        setError(msg);

        addPayment({
          id: Date.now().toString(),
          sender: "me",
          recipient: recipientAddress,
          amount,
          token: "SOL",
          status: "failed",
          isPrivate: visibility === "private",
          timestamp: Date.now(),
        });

        return null;
      }
    },
    [publicKey, signTransaction, connection, addPayment]
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxSignature(null);
  }, []);

  return { sendPrivatePayment, step, error, txSignature, reset };
}
