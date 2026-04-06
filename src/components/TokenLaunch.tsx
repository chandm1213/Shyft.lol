"use client";

import { useState } from "react";
import {
  Rocket,
  Coins,
  X,
  Loader2,
  ExternalLink,
  Image as ImageIcon,
  Upload,
  DollarSign,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useWallet, pollConfirmation, getSharedConnection } from "@/hooks/usePrivyWallet";
import { toast } from "@/components/Toast";
import { uploadImage } from "@/components/RichContent";
import { VersionedTransaction } from "@solana/web3.js";
import { BAGS_REF_CODE } from "@/lib/bags";

interface TokenLaunchProps {
  onClose: () => void;
  onSuccess?: (tokenMint: string) => void;
  username?: string;
}

function friendlyError(msg: string): string {
  if (!msg) return "Something went wrong";
  const lower = msg.toLowerCase();
  if (lower.includes("insufficient lamports") || lower.includes("insufficient funds") || lower.includes("0x1"))
    return "Insufficient SOL balance. Please top up your wallet.";
  if (lower.includes("user rejected") || lower.includes("user denied"))
    return "Transaction cancelled.";
  if (lower.includes("blockhash") || lower.includes("expired"))
    return "Transaction expired. Please try again.";
  if (msg.length > 100) return msg.slice(0, 80) + "…";
  return msg;
}

export default function TokenLaunch({ onClose, onSuccess, username }: TokenLaunchProps) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const [step, setStep] = useState<"form" | "creating" | "launching" | "success">("form");
  const [name, setName] = useState(username ? `${username}` : "");
  const [symbol, setSymbol] = useState(username ? username.toUpperCase().slice(0, 6) : "");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [initialBuy, setInitialBuy] = useState("0");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [result, setResult] = useState<{ tokenMint: string; metadataUrl: string } | null>(null);
  const [error, setError] = useState("");

  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    setImageFile(file);
    setUploadingImage(true);
    setError("");
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
    } catch (err: any) {
      setError("Failed to upload image. Try again.");
      setImageFile(null);
    }
    setUploadingImage(false);
  };

  const handleLaunch = async () => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      toast("error", "Connect your wallet first");
      return;
    }
    if (!name || !symbol || !description || !imageUrl) {
      setError("Please fill in all required fields");
      return;
    }

    setError("");
    setStep("creating");

    try {
      // Step 1: Create token info + metadata via Bags API
      const infoRes = await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-token-info",
          name, symbol, description, imageUrl,
          twitter: twitter || undefined,
          website: website || undefined,
        }),
      });
      const infoData = await infoRes.json();
      if (!infoData.success) throw new Error(infoData.error || "Failed to create token info");

      const { tokenMint, metadataUrl } = infoData.response;
      toast("success", "Token metadata created!");

      // Step 2: Create fee share config + launch tx, then batch sign
      setStep("launching");

      const connection = getSharedConnection();

      // Create fee share config (returns unsigned txs)
      const configRes = await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-config",
          payerWallet: publicKey.toBase58(),
          tokenMint,
          feeClaimers: [{ wallet: publicKey.toBase58(), bps: 10000 }],
        }),
      });
      const configData = await configRes.json();
      if (!configData.success) throw new Error(configData.error || "Failed to create fee config");

      // Sign & send config transactions (required before launch)
      const configTxs = (configData.response.transactions || []).map((b64: string) =>
        VersionedTransaction.deserialize(Buffer.from(b64, "base64"))
      );

      if (configTxs.length > 0) {
        toast("info", "Approve transaction to set up token...");
        const signedConfigTxs = await signAllTransactions(configTxs);
        for (const signed of signedConfigTxs) {
          const sig = await connection.sendRawTransaction(signed.serialize());
          await pollConfirmation(connection, sig);
        }
      }

      // Create launch transaction (now config exists on-chain)
      // Pass the per-token configKey from create-config — it already has partner info baked in
      const launchRes = await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-launch-tx",
          metadataUrl, tokenMint,
          launchWallet: publicKey.toBase58(),
          initialBuyLamports: Math.floor(Number(initialBuy) * 1e9),
          configKey: configData.response.configKey,
        }),
      });
      const launchData = await launchRes.json();
      if (!launchData.success) throw new Error(launchData.error || "Failed to create launch tx");

      toast("info", "Approve transaction to launch token...");
      const launchTx = VersionedTransaction.deserialize(
        Buffer.from(launchData.response.unsignedTxBase64, "base64")
      );
      const signedLaunch = await signTransaction(launchTx);
      const launchSig = await connection.sendRawTransaction(signedLaunch.serialize());
      await pollConfirmation(connection, launchSig);

      setResult({ tokenMint, metadataUrl });
      setStep("success");
      toast("success", "Token launched successfully! 🚀");
      onSuccess?.(tokenMint);
    } catch (err: any) {
      console.error("Token launch error:", err);
      const msg = friendlyError(err.message);
      setError(msg);
      setStep("form");
      toast("error", msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-[#E2E8F0]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">Launch Creator Token</h2>
              <p className="text-xs text-[#64748B]">Powered by Bags.fm</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F1F5F9] rounded-lg transition">
            <X className="w-5 h-5 text-[#94A3B8]" />
          </button>
        </div>

        {/* Success State */}
        {step === "success" && result && (
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-[#16A34A]" />
            </div>
            <h3 className="text-xl font-bold text-[#1A1A2E] mb-2">Token Launched! 🎉</h3>
            <p className="text-sm text-[#64748B] mb-4">Your creator token is now live on Solana</p>

            <div className="bg-[#F8FAFC] rounded-xl p-4 mb-4 text-left border border-[#E2E8F0]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#64748B]">Token Mint</span>
                <span className="text-xs font-mono text-[#475569]">
                  {result.tokenMint.slice(0, 8)}...{result.tokenMint.slice(-8)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748B]">Symbol</span>
                <span className="text-sm font-bold text-[#2563EB]">${symbol}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <a
                href={`https://bags.fm/${result.tokenMint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#2563EB] text-white rounded-xl font-medium text-sm hover:bg-[#1D4ED8] transition"
              >
                View on Bags <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-[#E2E8F0] rounded-xl font-medium text-sm hover:bg-[#F8FAFC] transition text-[#475569]"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Loading States */}
        {(step === "creating" || step === "launching") && (
          <div className="p-6 text-center">
            <Loader2 className="w-12 h-12 text-[#2563EB] animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">
              {step === "creating" ? "Creating Token Metadata..." : "Launching Token..."}
            </h3>
            <p className="text-sm text-[#64748B]">
              {step === "creating"
                ? "Setting up your token on Bags.fm"
                : "Deploying to Solana — please approve the transaction"}
            </p>
          </div>
        )}

        {/* Form */}
        {step === "form" && (
          <div className="p-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            {/* Token Name */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Token Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Shaan Token"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>

            {/* Symbol */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Symbol *</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-[#94A3B8]">$</span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  placeholder="e.g. SHAAN"
                  maxLength={6}
                  className="w-full pl-7 pr-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-2.5 text-sm font-mono text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell people about your token..."
                rows={3}
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm text-[#1A1A2E] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>

            {/* Token Image */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Token Image *</label>
              {imageUrl ? (
                <div className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
                  <div className="w-14 h-14 rounded-xl border-2 border-[#2563EB]/20 overflow-hidden shrink-0">
                    <img src={imageUrl} alt="Token" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#475569] truncate">{imageFile?.name || "Image uploaded"}</p>
                    <button
                      type="button"
                      onClick={() => { setImageUrl(""); setImageFile(null); }}
                      className="text-xs text-red-500 hover:text-red-600 mt-1"
                    >
                      Remove & choose another
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-[#E2E8F0] rounded-xl cursor-pointer hover:border-[#2563EB]/40 hover:bg-[#EFF6FF]/50 transition">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(file);
                    }}
                  />
                  {uploadingImage ? (
                    <>
                      <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin mb-1" />
                      <span className="text-xs text-[#64748B]">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-[#94A3B8] mb-1" />
                      <span className="text-sm text-[#64748B]">Click to upload image</span>
                      <span className="text-xs text-[#94A3B8] mt-0.5">PNG, JPG, GIF — max 5MB</span>
                    </>
                  )}
                </label>
              )}
            </div>

            {/* Social Links */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-[#64748B] mb-1 block">Twitter (optional)</label>
                <input
                  type="url"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="https://x.com/..."
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#64748B] mb-1 block">Website (optional)</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Initial Buy */}
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Initial Buy (SOL) — optional</label>
              <p className="text-[10px] text-[#94A3B8] mb-2">Buy some of your own token at launch. Set to 0 if you don't want to.</p>
              <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5">
                <DollarSign className="w-4 h-4 text-[#94A3B8]" />
                <input
                  type="number"
                  value={initialBuy}
                  onChange={(e) => setInitialBuy(e.target.value)}
                  min="0"
                  step="0.01"
                  className="flex-1 bg-transparent text-sm text-[#1A1A2E] focus:outline-none"
                />
                <span className="text-xs font-medium text-[#64748B]">SOL</span>
              </div>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-2 p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
              <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
              <div className="text-xs text-[#1D4ED8]">
                <p className="font-medium mb-0.5">How it works</p>
                <p className="text-[#3B82F6]">Your token launches on Bags.fm with a bonding curve. When people trade your token, you earn fees forever.</p>
              </div>
            </div>

            {/* Launch Button */}
            <button
              onClick={handleLaunch}
              disabled={!name || !symbol || !description || !imageUrl || !publicKey}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Rocket className="w-4 h-4" />
              Launch Token on Bags
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
