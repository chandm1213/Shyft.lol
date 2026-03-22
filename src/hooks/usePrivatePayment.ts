"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { useAppStore } from "@/lib/store";
import { ShyftClient, deriveChatId, getChatPda } from "@/lib/program";

export type PaymentStep = "idle" | "sending" | "confirming" | "recording" | "delegating" | "done" | "error";

export function usePrivatePayment() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { addPayment } = useAppStore();
  const [step, setStep] = useState<PaymentStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const sendPayment = useCallback(
    async (recipientAddress: string, amount: number, program?: ShyftClient | null) => {
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

        // Step 1: Direct SOL transfer on Solana
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

        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        console.log("✅ Payment confirmed:", sig);
        setTxSignature(sig);

        // Step 2: Record payment on-chain with MagicBlock TEE delegation
        if (program) {
          setStep("recording");
          console.log("📝 Recording payment on-chain with MagicBlock...");

          try {
            // Derive chat ID between sender and recipient
            const chatId = deriveChatId(publicKey, recipientPubkey);
            const [chatPda] = getChatPda(chatId);

            // Check if chat exists, if not create it with MagicBlock permission
            let chatExists = false;
            try {
              const chatAccInfo = await connection.getAccountInfo(chatPda);
              chatExists = chatAccInfo !== null;
            } catch {
              chatExists = false;
            }

            if (!chatExists) {
              console.log("💬 Creating chat for payment record...");
              try {
                await program.createPrivateChatFull(chatId, recipientPubkey);
                console.log("✅ Chat created with MagicBlock permission");
                chatExists = true;
              } catch (chatErr: any) {
                console.warn("⚠️ Chat creation failed:", chatErr?.message?.slice(0, 100));
              }
            }

            if (chatExists) {
              // Get current message count to determine index
              let msgIndex = 0;
              try {
                const chatData = await program.getChat(chatId);
                if (chatData) {
                  msgIndex = Number(chatData.messageCount || 0);
                }
              } catch {
                msgIndex = 0;
              }

              setStep("delegating");
              console.log("🔐 Delegating payment record to MagicBlock TEE...");

              // sendMessage creates the on-chain record + MagicBlock permission + TEE delegation
              const paymentLamports = Math.round(amount * 1_000_000); // micro-SOL for display
              const msgSig = await program.sendMessage(
                chatId,
                msgIndex,
                `💸 Payment: ${amount} SOL (TX: ${sig.slice(0, 8)}...)`,
                true,
                paymentLamports
              );
              console.log("✅ Payment recorded on-chain + delegated to MagicBlock TEE:", msgSig);
            }
          } catch (recordErr: any) {
            // Payment already sent — on-chain record is best-effort
            console.warn("⚠️ MagicBlock record failed (SOL already sent):", recordErr?.message?.slice(0, 100));
          }
        }

        setStep("done");

        addPayment({
          id: sig,
          sender: "me",
          recipient: recipientAddress,
          amount,
          token: "SOL",
          status: "completed",
          isPrivate: true,
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
          isPrivate: true,
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
