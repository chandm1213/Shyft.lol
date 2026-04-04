"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet, pollConfirmation } from "@/hooks/usePrivyWallet";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { useAppStore } from "@/lib/store";

export type PaymentStep = "idle" | "sending" | "confirming" | "recording" | "finalizing" | "done" | "error";

export function usePrivatePayment() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { addPayment } = useAppStore();
  const [step, setStep] = useState<PaymentStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const sendPayment = useCallback(
    async (recipientAddress: string, amount: number) => {
      if (!publicKey || !signTransaction) {
        setError("Wallet not connected");
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

        const lamports = Math.round(amount * LAMPORTS_PER_SOL);

        // Check balance
        const balance = await connection.getBalance(publicKey);
        if (balance < lamports + 10000) {
          throw new Error(`Insufficient balance. You have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        }

        // Direct SOL transfer on Solana
        setStep("sending");
        console.log(`💸 Sending ${amount} SOL to ${recipientAddress.slice(0, 8)}...`);

        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: recipientPubkey,
            lamports,
          })
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const signedTx = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
        });

        setStep("confirming");
        console.log("⏳ Confirming payment tx:", sig);

        await pollConfirmation(connection, sig);

        console.log("✅ Payment confirmed:", sig);
        setTxSignature(sig);
        setStep("done");

        addPayment({
          id: sig,
          sender: "me",
          recipient: recipientAddress,
          amount,
          token: "SOL",
          status: "completed",
          isPrivate: false,
          timestamp: Date.now(),
          txSignature: sig,
        });

        return { transferSig: sig };
      } catch (err: any) {
        console.error("Payment error:", err);
        setStep("error");
        setError(err?.message || "Payment failed");

        addPayment({
          id: Date.now().toString(),
          sender: "me",
          recipient: recipientAddress,
          amount,
          token: "SOL",
          status: "failed",
          isPrivate: false,
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

  return { sendPayment, step, error, txSignature, reset };
}
