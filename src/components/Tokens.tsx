"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Coins,
  Rocket,
  TrendingUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  DollarSign,
  Wallet,
  ChevronRight,
  Star,
  BarChart3,
  Shield,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useWallet, pollConfirmation } from "@/hooks/usePrivyWallet";
import { toast } from "@/components/Toast";
import TokenLaunch from "@/components/TokenLaunch";
import TokenTrade from "@/components/TokenTrade";
import { formatSOL, BAGS_REF_CODE } from "@/lib/bags";
import { Connection, VersionedTransaction, Transaction } from "@solana/web3.js";

interface TokenItem {
  name: string;
  symbol: string;
  description: string;
  image: string;
  tokenMint: string;
  status: string;
  twitter?: string;
  website?: string;
  launchWallet?: string;
}

interface ClaimablePosition {
  baseMint: string;
  totalClaimableLamportsUserShare?: string;
  virtualPoolClaimableAmount?: string;
  dammPoolClaimableAmount?: string;
}

export default function Tokens() {
  const { publicKey, signTransaction } = useWallet();
  const { isConnected } = useAppStore();
  const [tab, setTab] = useState<"discover" | "my-tokens" | "earnings">("discover");
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [myTokens, setMyTokens] = useState<TokenItem[]>([]);
  const [claimable, setClaimable] = useState<ClaimablePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMyTokens, setLoadingMyTokens] = useState(false);
  const [loadingFees, setLoadingFees] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenItem | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bags?action=feed");
      const data = await res.json();
      if (data.success && Array.isArray(data.response)) {
        setTokens(data.response);
      }
    } catch (err) {
      console.error("Failed to fetch token feed:", err);
    }
    setLoading(false);
  }, []);

  const fetchClaimable = useCallback(async () => {
    if (!publicKey) return;
    setLoadingFees(true);
    try {
      const res = await fetch(`/api/bags?action=fees&wallet=${publicKey.toBase58()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.response)) {
        setClaimable(data.response);
      }
    } catch (err) {
      console.error("Failed to fetch claimable:", err);
    }
    setLoadingFees(false);
  }, [publicKey]);

  // Fetch user's tokens via dedicated endpoint (fee-admin mints + feed launchWallet match)
  const fetchMyTokens = useCallback(async () => {
    if (!publicKey) return;
    setLoadingMyTokens(true);
    try {
      const walletStr = publicKey.toBase58();
      const res = await fetch(`/api/bags?action=user-tokens&wallet=${walletStr}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.response)) {
        setMyTokens(data.response);
      }
    } catch (err) {
      console.error("Failed to fetch my tokens:", err);
    }
    setLoadingMyTokens(false);
  }, [publicKey]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  useEffect(() => {
    if (tab === "earnings" && publicKey) fetchClaimable();
  }, [tab, publicKey, fetchClaimable]);

  useEffect(() => {
    if (tab === "my-tokens" && publicKey) fetchMyTokens();
  }, [tab, publicKey, fetchMyTokens]);

  const totalClaimableSOL = claimable.reduce((sum, p) => {
    const amount = Number(p.totalClaimableLamportsUserShare || p.virtualPoolClaimableAmount || 0)
      + Number(p.dammPoolClaimableAmount || 0);
    return sum + amount;
  }, 0);

  const handleClaim = async (tokenMint: string) => {
    if (!publicKey || !signTransaction) return;
    try {
      toast("info", "Creating claim transaction...");
      const res = await fetch("/api/bags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", walletAddress: publicKey.toBase58(), tokenMint }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const txList: { unsignedTxBase64: string }[] = data.response;
      if (!txList || txList.length === 0) throw new Error("No claim transactions returned");

      const connection = new Connection("/api/rpc", { commitment: "confirmed", wsEndpoint: undefined });

      toast("info", `Signing ${txList.length} claim transaction(s)...`);

      for (const txData of txList) {
        const buf = Buffer.from(txData.unsignedTxBase64, "base64");
        // Try VersionedTransaction first, fallback to legacy Transaction
        let tx: VersionedTransaction | Transaction;
        try {
          tx = VersionedTransaction.deserialize(buf);
        } catch {
          tx = Transaction.from(buf);
        }
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await pollConfirmation(connection, sig);
      }

      toast("success", "Fees claimed! Check your wallet. 🎉");
      fetchClaimable();
    } catch (err: any) {
      console.error("Claim error:", err);
      toast("error", err.message || "Failed to claim fees");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1A1A2E]">Creator Tokens</h1>
            <p className="text-xs text-[#64748B]">Launch, trade & earn — powered by Bags.fm</p>
          </div>
        </div>
        <button
          onClick={() => setShowLaunchModal(true)}
          className="flex items-center gap-1.5 py-2 px-4 bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white rounded-xl font-medium text-sm hover:opacity-90 transition"
        >
          <Rocket className="w-4 h-4" />
          Launch Token
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#F1F5F9] rounded-xl p-1">
        {([
          { id: "discover" as const, label: "Discover", icon: TrendingUp },
          { id: "my-tokens" as const, label: "My Tokens", icon: Wallet },
          { id: "earnings" as const, label: "Earnings", icon: DollarSign },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition ${
              tab === id ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#64748B] hover:text-[#475569]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Discover Tab */}
      {tab === "discover" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#475569]">Trending Tokens</h2>
            <button onClick={fetchTokens} className="p-1.5 hover:bg-[#F1F5F9] rounded-lg transition">
              <RefreshCw className={`w-4 h-4 text-[#94A3B8] ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
                <Coins className="w-7 h-7 text-[#94A3B8]" />
              </div>
              <p className="text-sm font-medium text-[#475569]">No tokens found</p>
              <p className="text-xs text-[#94A3B8] mt-1">Be the first to launch a creator token!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.slice(0, 20).map((token, i) => (
                <button
                  key={token.tokenMint}
                  onClick={() => setSelectedToken(token)}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:shadow-sm transition text-left"
                >
                  <span className="text-xs font-medium text-[#94A3B8] w-5">{i + 1}</span>
                  {token.image ? (
                    <img src={token.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{token.symbol?.[0] || "?"}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-[#1A1A2E] truncate">{token.name}</span>
                      <span className="text-xs text-[#94A3B8]">${token.symbol}</span>
                    </div>
                    <p className="text-xs text-[#64748B] truncate">{token.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      token.status === "MIGRATED" ? "bg-[#F0FDF4] text-[#16A34A]"
                        : token.status === "PRE_GRAD" ? "bg-[#FFFBEB] text-[#D97706]"
                        : "bg-[#F1F5F9] text-[#64748B]"
                    }`}>
                      {token.status === "MIGRATED" ? "Live" : token.status === "PRE_GRAD" ? "Pre-Grad" : token.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#CBD5E1]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Tokens Tab */}
      {tab === "my-tokens" && (
        <div>
          {!isConnected ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] flex items-center justify-center mx-auto mb-3">
                  <Wallet className="w-7 h-7 text-[#2563EB]" />
                </div>
                <p className="text-sm font-medium text-[#475569]">Connect your wallet</p>
                <p className="text-xs text-[#94A3B8] mt-1">to see your tokens</p>
              </div>
            </div>
          ) : (
            <div>
              {/* Launch CTA */}
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] flex items-center justify-center">
                    <Star className="w-4 h-4 text-[#2563EB]" />
                  </div>
                  <span className="text-sm font-semibold text-[#1A1A2E]">Launch Your Token</span>
                </div>
                <p className="text-xs text-[#64748B] mb-3">
                  Create your own token and earn fees every time someone trades it.
                </p>
                <button
                  onClick={() => setShowLaunchModal(true)}
                  className="flex items-center gap-1.5 py-2 px-4 bg-[#2563EB] text-white rounded-xl font-medium text-xs hover:bg-[#1D4ED8] transition"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  Launch Token
                </button>
              </div>

              {/* User's Tokens List */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#475569]">Your Tokens</h2>
                <button onClick={fetchMyTokens} className="p-1.5 hover:bg-[#F1F5F9] rounded-lg transition">
                  <RefreshCw className={`w-4 h-4 text-[#94A3B8] ${loadingMyTokens ? "animate-spin" : ""}`} />
                </button>
              </div>

              {loadingMyTokens ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                </div>
              ) : myTokens.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
                    <Coins className="w-6 h-6 text-[#94A3B8]" />
                  </div>
                  <p className="text-sm font-medium text-[#475569]">No tokens yet</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Launch a token or trade to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myTokens.map((token) => (
                    <button
                      key={token.tokenMint}
                      onClick={() => setSelectedToken(token)}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:shadow-sm transition text-left"
                    >
                      {token.image ? (
                        <img src={token.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
                          <span className="text-xs font-bold text-white">{token.symbol?.[0] || "?"}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[#1A1A2E] truncate">{token.name}</span>
                          <span className="text-xs text-[#94A3B8]">${token.symbol}</span>
                        </div>
                        {token.description && (
                          <p className="text-xs text-[#64748B] truncate">{token.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          token.status === "MIGRATED" ? "bg-[#F0FDF4] text-[#16A34A]"
                            : token.status === "PRE_GRAD" ? "bg-[#FFFBEB] text-[#D97706]"
                            : "bg-[#F1F5F9] text-[#64748B]"
                        }`}>
                          {token.status === "MIGRATED" ? "Live" : token.status === "PRE_GRAD" ? "Pre-Grad" : token.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#CBD5E1]" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-[#94A3B8] text-center py-4">
                <a href={`https://bags.fm/?ref=${BAGS_REF_CODE}`} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] hover:underline">
                  Browse all tokens on Bags.fm →
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Earnings Tab */}
      {tab === "earnings" && (
        <div>
          {!isConnected ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-7 h-7 text-[#16A34A]" />
                </div>
                <p className="text-sm font-medium text-[#475569]">Connect your wallet</p>
                <p className="text-xs text-[#94A3B8] mt-1">to see your earnings</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-[#F0FDF4] flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-[#16A34A]" />
                      </div>
                      <span className="text-xs font-medium text-[#64748B]">Total Claimable</span>
                    </div>
                    <p className="text-2xl font-bold text-[#1A1A2E]">
                      {formatSOL(totalClaimableSOL)} <span className="text-sm font-medium text-[#64748B]">SOL</span>
                    </p>
                    <p className="text-[10px] text-[#16A34A] flex items-center gap-1 mt-1">
                      <Shield className="w-2.5 h-2.5" /> Fee earnings from token trading
                    </p>
                  </div>
                  <button onClick={fetchClaimable} className="p-2 hover:bg-[#F1F5F9] rounded-lg transition">
                    <RefreshCw className={`w-4 h-4 text-[#94A3B8] ${loadingFees ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {loadingFees ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                </div>
              ) : claimable.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
                    <BarChart3 className="w-6 h-6 text-[#94A3B8]" />
                  </div>
                  <p className="text-sm font-medium text-[#475569]">No claimable fees yet</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Launch a token and get trading volume to earn fees</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {claimable.map((position) => {
                    const claimableAmount = Number(
                      position.totalClaimableLamportsUserShare || position.virtualPoolClaimableAmount || 0
                    ) + Number(position.dammPoolClaimableAmount || 0);
                    return (
                      <div key={position.baseMint} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-[#E2E8F0]">
                        <div>
                          <p className="text-xs font-mono text-[#64748B]">
                            {position.baseMint.slice(0, 8)}...{position.baseMint.slice(-8)}
                          </p>
                          <p className="text-sm font-semibold text-[#1A1A2E]">{formatSOL(claimableAmount)} SOL</p>
                        </div>
                        <button
                          onClick={() => handleClaim(position.baseMint)}
                          disabled={claimableAmount <= 0}
                          className="py-1.5 px-3 bg-[#16A34A] text-white rounded-xl text-xs font-medium hover:bg-[#15803D] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Claim
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Token Detail / Trade Modal */}
      {selectedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                {selectedToken.image ? (
                  <img src={selectedToken.image} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{selectedToken.symbol?.[0]}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-[#1A1A2E]">{selectedToken.name}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#64748B]">${selectedToken.symbol}</span>
                    <a href={`https://bags.fm/${selectedToken.tokenMint}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#2563EB] hover:underline flex items-center gap-0.5">
                      Bags <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <button onClick={() => setSelectedToken(null)} className="p-2 hover:bg-[#F1F5F9] rounded-lg">✕</button>
              </div>
              {selectedToken.description && <p className="text-xs text-[#64748B] mt-2">{selectedToken.description}</p>}
            </div>
            <div className="p-4">
              <TokenTrade tokenMint={selectedToken.tokenMint} tokenSymbol={selectedToken.symbol} tokenImage={selectedToken.image} compact />
            </div>
          </div>
        </div>
      )}

      {/* Launch Modal */}
      {showLaunchModal && (
        <TokenLaunch
          onClose={() => setShowLaunchModal(false)}
          onSuccess={(mint) => { setShowLaunchModal(false); fetchTokens(); toast("success", "Your token is live!"); }}
          username={useAppStore.getState().currentUser?.username}
        />
      )}
    </div>
  );
}
