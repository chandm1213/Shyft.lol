"use client";

import { useState, useEffect } from "react";
import {
  ArrowUpDown,
  Loader2,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  ChevronDown,
  DollarSign,
  Info,
} from "lucide-react";
import { useWallet } from "@/hooks/usePrivyWallet";
import { toast } from "@/components/Toast";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { SOL_MINT, formatSOL } from "@/lib/bags";

interface TokenTradeProps {
  tokenMint: string;
  tokenSymbol: string;
  tokenImage?: string;
  onClose?: () => void;
  compact?: boolean;
}

export default function TokenTrade({
  tokenMint,
  tokenSymbol,
  tokenImage,
  onClose,
  compact = false,
}: TokenTradeProps) {
  const { publicKey, signTransaction } = useWallet();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState("");

  // Get a quote when amount changes
  useEffect(() => {
    if (!amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoting(true);
      setError("");
      try {
        const inputMint = mode === "buy" ? SOL_MINT : tokenMint;
        const outputMint = mode === "buy" ? tokenMint : SOL_MINT;
        const amountSmallest = mode === "buy"
          ? Math.floor(Number(amount) * 1e9)
          : Math.floor(Number(amount) * 1e6);

        const res = await fetch("/api/bags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "quote", inputMint, outputMint, amount: amountSmallest }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setQuote(data.response);
      } catch (err: any) {
        setError(err.message || "Failed to get quote");
        setQuote(null);
      }
      setQuoting(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [amount, mode, tokenMint]);

  const handleTrade = async () => {
    if (!publicKey || !signTransaction || !quote) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap", quoteResponse: quote, userPublicKey: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const tx = VersionedTransaction.deserialize(
        Buffer.from(data.response.unsignedTxBase64, "base64")
      );
      const signed = await signTransaction(tx);

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
        "confirmed"
      );
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      toast("success", `${mode === "buy" ? "Bought" : "Sold"} ${tokenSymbol} successfully! 🎉`);
      setAmount("");
      setQuote(null);
    } catch (err: any) {
      console.error("Trade error:", err);
      setError(err.message || "Trade failed");
      toast("error", err.message || "Trade failed");
    }
    setLoading(false);
  };

  const containerClass = compact
    ? "bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4"
    : "bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-5";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {tokenImage && (
            <img src={tokenImage} alt={tokenSymbol} className="w-6 h-6 rounded-full" />
          )}
          <span className="font-bold text-sm text-[#1A1A2E]">
            {mode === "buy" ? "Buy" : "Sell"} ${tokenSymbol}
          </span>
        </div>
        <a
          href={`https://bags.fm/${tokenMint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#94A3B8] hover:text-[#2563EB] flex items-center gap-1"
        >
          Bags <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Buy/Sell Toggle */}
      <div className="flex bg-[#F1F5F9] rounded-lg p-0.5 mb-3">
        <button
          onClick={() => { setMode("buy"); setAmount(""); setQuote(null); }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            mode === "buy" ? "bg-[#16A34A] text-white shadow-sm" : "text-[#64748B] hover:text-[#475569]"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => { setMode("sell"); setAmount(""); setQuote(null); }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            mode === "sell" ? "bg-[#DC2626] text-white shadow-sm" : "text-[#64748B] hover:text-[#475569]"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-3">
        <label className="block text-xs text-[#64748B] mb-1">
          {mode === "buy" ? "Amount (SOL)" : `Amount (${tokenSymbol})`}
        </label>
        <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5">
          <DollarSign className="w-4 h-4 text-[#94A3B8]" />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step={mode === "buy" ? "0.01" : "1"}
            className="flex-1 bg-transparent text-sm text-[#1A1A2E] focus:outline-none"
          />
          <span className="text-xs font-medium text-[#64748B]">
            {mode === "buy" ? "SOL" : tokenSymbol}
          </span>
        </div>
        {mode === "buy" && (
          <div className="flex gap-1.5 mt-1.5">
            {["0.1", "0.5", "1", "5"].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(val)}
                className="flex-1 py-1 text-[10px] font-medium bg-[#F1F5F9] rounded-lg text-[#64748B] hover:bg-[#EFF6FF] hover:text-[#2563EB] transition"
              >
                {val} SOL
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quote Details */}
      {quoting && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin" />
          <span className="text-xs text-[#94A3B8] ml-2">Getting quote...</span>
        </div>
      )}

      {quote && !quoting && (
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mb-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-[#64748B]">You {mode === "buy" ? "receive" : "get back"}</span>
            <span className="font-medium text-[#1A1A2E]">
              {mode === "buy"
                ? `${(Number(quote.outAmount) / 1e6).toFixed(2)} ${tokenSymbol}`
                : `${formatSOL(quote.outAmount)} SOL`}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#64748B]">Price Impact</span>
            <span className={`font-medium ${Number(quote.priceImpactPct) > 3 ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
              {Number(quote.priceImpactPct).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#64748B]">Min. received</span>
            <span className="text-[#475569]">
              {mode === "buy"
                ? `${(Number(quote.minOutAmount) / 1e6).toFixed(2)} ${tokenSymbol}`
                : `${formatSOL(quote.minOutAmount)} SOL`}
            </span>
          </div>
          {quote.routePlan?.length > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-[#64748B]">Route</span>
              <span className="text-[#475569]">
                {quote.routePlan.map((leg: any) => leg.venue).join(" → ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {/* Trade Button */}
      <button
        onClick={handleTrade}
        disabled={!quote || loading || !publicKey || quoting}
        className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${
          mode === "buy"
            ? "bg-[#16A34A] hover:bg-[#15803D] text-white"
            : "bg-[#DC2626] hover:bg-[#B91C1C] text-white"
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {mode === "buy" ? "Buying..." : "Selling..."}
          </>
        ) : (
          <>
            {mode === "buy" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {mode === "buy" ? `Buy $${tokenSymbol}` : `Sell $${tokenSymbol}`}
          </>
        )}
      </button>

      {/* Bags Attribution */}
      <p className="text-center text-[10px] text-[#94A3B8] mt-2">
        Trading powered by{" "}
        <a href="https://bags.fm" target="_blank" rel="noopener noreferrer" className="text-[#2563EB] hover:underline">
          Bags.fm
        </a>
      </p>
    </div>
  );
}
