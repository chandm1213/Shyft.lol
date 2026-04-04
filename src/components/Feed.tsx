"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle, Share2, Repeat2, Globe, Send, Shield, RefreshCw, Image as ImageIcon, X, BadgeCheck, Trash2, Lock, Unlock, DollarSign, Loader2, Coins, TrendingUp } from "lucide-react";

// Gold badge for OG / founder accounts
const GOLD_BADGE_USERNAMES = ["shaan", "shyft"];
import { useAppStore } from "@/lib/store";
import { toast } from "@/components/Toast";
import { RichContent, MediaBar, uploadMedia, isVideoFile } from "@/components/RichContent";
import { useProgram } from "@/hooks/useProgram";
import { useWallet, useConnection, pollConfirmation } from "@/hooks/usePrivyWallet";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ShyftClient, clearRpcCache } from "@/lib/program";
import ProfileHoverCard from "@/components/ProfileHoverCard";

/** Parse a paid post: content starts with PAID|<price>|<actual content> */
function parsePaidPost(content: string): { isPaid: boolean; price: number; actualContent: string } {
  if (content.startsWith("PAID|")) {
    const firstPipe = content.indexOf("|");
    const secondPipe = content.indexOf("|", firstPipe + 1);
    if (secondPipe !== -1) {
      const price = parseFloat(content.substring(firstPipe + 1, secondPipe));
      const actualContent = content.substring(secondPipe + 1);
      if (!isNaN(price) && price > 0) {
        return { isPaid: true, price, actualContent };
      }
    }
  }
  return { isPaid: false, price: 0, actualContent: content };
}

/** Parse a community post: content starts with COMM|<communityId>|<actual content> */
export function parseCommunityPost(content: string): { isCommunity: boolean; communityId: number; actualContent: string } {
  if (content.startsWith("COMM|")) {
    const firstPipe = content.indexOf("|");
    const secondPipe = content.indexOf("|", firstPipe + 1);
    if (secondPipe !== -1) {
      const communityId = parseInt(content.substring(firstPipe + 1, secondPipe));
      const actualContent = content.substring(secondPipe + 1);
      if (!isNaN(communityId)) {
        return { isCommunity: true, communityId, actualContent };
      }
    }
  }
  return { isCommunity: false, communityId: 0, actualContent: content };
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}


/** Reaction emoji map: type index → emoji + label + colors */
const REACTIONS = [
  { emoji: "❤️", label: "Love", bg: "bg-red-50", text: "text-red-500", activeBg: "bg-red-100" },
  { emoji: "🔥", label: "Fire", bg: "bg-orange-50", text: "text-orange-500", activeBg: "bg-orange-100" },
  { emoji: "🚀", label: "Rocket", bg: "bg-blue-50", text: "text-blue-500", activeBg: "bg-blue-100" },
  { emoji: "😂", label: "Laugh", bg: "bg-yellow-50", text: "text-yellow-600", activeBg: "bg-yellow-100" },
  { emoji: "👏", label: "Clap", bg: "bg-purple-50", text: "text-purple-500", activeBg: "bg-purple-100" },
  { emoji: "💡", label: "Insightful", bg: "bg-teal-50", text: "text-teal-500", activeBg: "bg-teal-100" },
];

/** Reusable on-chain post card with on-chain likes, comments & reactions */
export function OnChainPostCard({
  post,
  profile,
  isMe,
  program,
  allComments,
  allReactions,
  profileMap,
  onCommentAdded,
  onReactionAdded,
  onRepost,
  onDelete,
}: {
  post: any;
  profile: any;
  isMe: boolean;
  program: ShyftClient | null;
  allComments: { publicKey: string; post: string; author: string; commentIndex: string; content: string; createdAt: string }[];
  allReactions: { publicKey: string; post: string; user: string; reactionType: number }[];
  profileMap: Record<string, any>;
  onCommentAdded: () => void;
  onReactionAdded: () => void;
  onRepost: (content: string) => void;
  onDelete: () => void;
}) {
  const { likedPosts, addLikedPost, isConnected, currentUser, navigateToProfile, unlockedPosts, addUnlockedPost, addPayment, postTips, addPostTip } = useAppStore();
  const { publicKey: walletKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [liking, setLiking] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [localLikeBoost, setLocalLikeBoost] = useState(0);
  const [reposting, setReposting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipping, setTipping] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [flexing, setFlexing] = useState(false);

  // Paid post detection
  const { isPaid, price: postPrice, actualContent } = parsePaidPost(post.content);
  const isUnlocked = unlockedPosts.includes(post.publicKey) || isMe;

  const hasLiked = likedPosts.includes(post.publicKey);
  const postComments = allComments.filter((c) => c.post === post.publicKey)
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  const postReactions = allReactions.filter((r) => r.post === post.publicKey);
  const totalLikes = Number(post.likes || 0) + localLikeBoost;
  const totalComments = postComments.length;

  /** Unlock a paid post by sending SOL directly to the creator's wallet */
  const handleUnlock = async () => {
    if (!walletKey || !signTransaction || !connection || unlocking) return;
    setUnlocking(true);
    try {
      const creatorPubkey = new PublicKey(post.author);
      const lamports = Math.round(postPrice * LAMPORTS_PER_SOL);

      // Check balance
      const balance = await connection.getBalance(walletKey);
      if (balance < lamports + 10000) {
        toast("error", "Insufficient SOL", `You need at least ${postPrice} SOL to unlock this post.`);
        setUnlocking(false);
        return;
      }

      toast("privacy", "Unlocking...", `Sending ${postPrice} SOL to creator`);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: walletKey,
          toPubkey: creatorPubkey,
          lamports,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = walletKey;

      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });

      // Poll for confirmation via HTTP — no WebSocket needed
      const confirmed = await pollConfirmation(connection, sig);

      // Always unlock — user already signed & sent the tx
      addUnlockedPost(post.publicKey);
      addPayment({
        id: sig,
        sender: "me",
        recipient: post.author,
        amount: postPrice,
        token: "SOL",
        status: "completed",
        isPrivate: false,
        timestamp: Date.now(),
        txSignature: sig,
      });

      if (confirmed) {
        toast("success", "Post unlocked! 🔓", `Paid ${postPrice} SOL — TX: ${sig.slice(0, 8)}...`);
      } else {
        toast("success", "Post unlocked! 🔓", `Payment sent — TX: ${sig.slice(0, 8)}...`);
      }
    } catch (err: any) {
      console.error("Unlock error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request") || err?.message?.includes("User exited")) {
        toast("error", "Unlock cancelled", "You rejected the transaction");
      } else {
        toast("error", "Unlock failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setUnlocking(false);
  };

  const handleTip = async (amount: number) => {
    if (!walletKey || !signTransaction || !connection || tipping || isMe) return;
    if (amount <= 0 || isNaN(amount)) { toast("error", "Invalid tip", "Enter a valid SOL amount"); return; }
    setTipping(true);
    setShowTip(false);
    try {
      const creatorPubkey = new PublicKey(post.author);
      const lamports = Math.round(amount * LAMPORTS_PER_SOL);

      const balance = await connection.getBalance(walletKey);
      if (balance < lamports + 10000) {
        toast("error", "Insufficient SOL", `You need at least ${amount} SOL to send this tip.`);
        setTipping(false);
        return;
      }

      toast("privacy", "Sending tip...", `${amount} SOL → creator`);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: walletKey,
          toPubkey: creatorPubkey,
          lamports,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = walletKey;

      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });

      // Poll for confirmation via HTTP — no WebSocket needed
      const tipConfirmed = await pollConfirmation(connection, sig);

      addPostTip(post.publicKey, amount);
      addPayment({
        id: sig,
        sender: "me",
        recipient: post.author,
        amount,
        token: "SOL",
        status: "completed",
        isPrivate: false,
        timestamp: Date.now(),
        txSignature: sig,
      });

      const authorName = profile?.username ? `@${profile.username}` : post.author.slice(0, 8);
      if (tipConfirmed) {
        toast("success", `Tipped ${amount} SOL! 💸`, `Sent to ${authorName} — TX: ${sig.slice(0, 8)}...`);
      } else {
        toast("success", `Tip sent! 💸`, `TX: ${sig.slice(0, 8)}... — confirming...`);
      }
      setTipAmount("");
    } catch (err: any) {
      console.error("Tip error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request") || err?.message?.includes("User exited")) {
        toast("error", "Tip cancelled", "You rejected the transaction");
      } else {
        toast("error", "Tip failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setTipping(false);
  };

  const tipInfo = postTips[post.publicKey];

  // Group reactions by type
  const reactionCounts: Record<number, number> = {};
  let myReactionType: number | null = null;
  const myAddr = walletKey?.toBase58() || "";
  for (const r of postReactions) {
    reactionCounts[r.reactionType] = (reactionCounts[r.reactionType] || 0) + 1;
    if (r.user === myAddr) myReactionType = r.reactionType;
  }

  const displayName = profile?.displayName && profile.displayName !== "Anonymous"
    ? profile.displayName
    : post.author.slice(0, 4) + "..." + post.author.slice(-4);
  const username = profile?.username && profile.username !== "anon"
    ? profile.username
    : post.author.slice(0, 8);
  // Use actual on-chain username for badge color
  const realUsername = profile?.username || "";

  const handleLike = async () => {
    if (!program || !isConnected || hasLiked || liking) return;
    setLiking(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      await program.likePost(authorPubkey, postId);
      addLikedPost(post.publicKey);
      setLocalLikeBoost((prev) => prev + 1);
      toast("success", "Liked! ❤️", "Recorded on-chain");
    } catch (err: any) {
      console.error("Like error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Like cancelled", "You rejected the transaction");
      } else if (err?.message?.includes("insufficient") || err?.message?.includes("0x1")) {
        toast("error", "Insufficient SOL", "Your wallet needs more SOL to interact.");
      } else {
        toast("error", "Like failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setLiking(false);
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    if (!program || !walletKey) {
      toast("error", "Not ready", "Wallet or program not loaded yet. Please wait...");
      return;
    }
    if (commenting) return;
    setCommenting(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      const commentIndex = Date.now();
      await program.createComment(authorPubkey, postId, commentIndex, commentText.trim());
      setCommentText("");
      toast("success", "Comment posted! 💬", "Your comment is on-chain");
      onCommentAdded();
    } catch (err: any) {
      console.error("Comment error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Comment cancelled", "You rejected the transaction");
      } else if (err?.message?.includes("insufficient") || err?.message?.includes("0x1")) {
        toast("error", "Insufficient SOL", "Please try again.");
      } else {
        toast("error", "Comment failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setCommenting(false);
  };

  const handleReaction = async (reactionType: number) => {
    if (!program || !isConnected || reacting) return;
    setReacting(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      await program.reactToPost(authorPubkey, postId, reactionType);
      setShowReactions(false);
      toast("success", `Reacted ${REACTIONS[reactionType].emoji}`, "Your reaction is on-chain!");
      onReactionAdded();
    } catch (err: any) {
      console.error("Reaction error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Reaction cancelled", "You rejected the transaction");
      } else if (err?.message?.includes("insufficient") || err?.message?.includes("0x1")) {
        toast("error", "Insufficient SOL", "Your wallet needs more SOL to react.");
      } else {
        toast("error", "Reaction failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setReacting(false);
  };

  const handleRemoveReaction = async () => {
    if (!program || !isConnected || reacting || myReactionType === null) return;
    setReacting(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      await program.removeReaction(authorPubkey, postId);
      toast("success", "Reaction removed", "Your reaction has been undone");
      onReactionAdded();
    } catch (err: any) {
      console.error("Remove reaction error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Cancelled", "You rejected the transaction");
      } else {
        toast("error", "Failed to remove reaction", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setReacting(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5 mb-3 sm:mb-4 animate-fade-in hover:shadow-md transition-shadow duration-300">
      {/* Author */}
      <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
        <ProfileHoverCard walletAddress={post.author} profile={profile}>
        <button
          type="button"
          onClick={() => navigateToProfile(post.author)}
          className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 text-left group cursor-pointer"
        >
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt={displayName} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0 group-hover:ring-2 group-hover:ring-[#2563EB]/30 transition-all" />
        ) : (
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-lg sm:text-xl border-2 border-white shadow-sm flex-shrink-0 group-hover:ring-2 group-hover:ring-[#2563EB]/30 transition-all ${
            isMe
              ? "bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE]"
              : "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]"
          }`}>
            {displayName.charAt(0)?.toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="font-semibold text-[#1A1A2E] text-sm truncate group-hover:text-[#2563EB] transition-colors">{displayName}</span>
            <BadgeCheck className={`w-3.5 h-3.5 flex-shrink-0 ${GOLD_BADGE_USERNAMES.includes(realUsername.toLowerCase()) ? "text-[#F59E0B]" : "text-[#2563EB]"}`} />
            <span className="text-xs text-[#94A3B8] truncate group-hover:text-[#2563EB]/70 transition-colors">@{username}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-[#94A3B8]">
              {post.createdAt !== "0" ? timeAgo(Number(post.createdAt) * 1000) : "recently"}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
              <Globe className="w-2.5 h-2.5" /> On-Chain
            </span>
            {isPaid && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> {postPrice} SOL
              </span>
            )}
          </div>
        </div>
        </button>
        </ProfileHoverCard>
      </div>

      {/* Content */}
      <div className="mb-3 pl-0 sm:pl-14">
        {(() => {
          // Determine the content to render (use actualContent for paid posts that are unlocked)
          const renderContent = isPaid && isUnlocked ? actualContent : post.content;

          // Paid post — locked state
          if (isPaid && !isUnlocked) {
            const previewText = actualContent.slice(0, 40).replace(/\n/g, " ");
            return (
              <div className="relative">
                {/* Blurred preview */}
                <div className="select-none pointer-events-none" style={{ filter: "blur(8px)", WebkitFilter: "blur(8px)" }}>
                  <p className="text-[15px] text-[#475569] leading-relaxed">
                    {previewText}{actualContent.length > 40 ? "..." : ""}
                  </p>
                </div>
                {/* Unlock overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-5 py-4 text-center shadow-lg max-w-[280px]">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-2">
                      <Lock className="w-5 h-5 text-amber-600" />
                    </div>
                    <p className="text-sm font-semibold text-[#1A1A2E] mb-1">Paid Content</p>
                    <p className="text-xs text-[#64748B] mb-3">
                      Unlock this post for <span className="font-bold text-amber-600">{postPrice} SOL</span>
                    </p>
                    <button
                      onClick={handleUnlock}
                      disabled={unlocking || !isConnected}
                      className="touch-active w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {unlocking ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Paying...
                        </>
                      ) : (
                        <>
                          <Unlock className="w-4 h-4" />
                          Unlock for {postPrice} SOL
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-[#94A3B8] mt-2">Payment goes directly to creator&apos;s wallet</p>
                  </div>
                </div>
                {/* Spacer so the card has enough height */}
                <div className="h-20" />
              </div>
            );
          }

          // Paid post — unlocked (show badge + content)
          if (isPaid && isUnlocked) {
            return (
              <div>
                {!isMe && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mb-2">
                    <Unlock className="w-2.5 h-2.5" /> Unlocked
                  </div>
                )}
                {isMe && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mb-2">
                    <DollarSign className="w-2.5 h-2.5" /> Paid Post · {postPrice} SOL
                  </div>
                )}
                <RichContent content={actualContent} />
              </div>
            );
          }

          // New format: RT|@author|content
          if (renderContent.startsWith("RT|")) {
            const parts = renderContent.split("|");
            const rtAuthor = parts[1] || "";
            const rtContent = parts.slice(2).join("|");
            // Find the wallet address for the repost author so we can navigate to their profile
            const rtUsername = rtAuthor.replace(/^@/, "").toLowerCase();
            const rtWallet = Object.entries(profileMap).find(([, p]) => p?.username?.toLowerCase() === rtUsername)?.[0];
            return (
              <div>
                <div className="flex items-center gap-1.5 text-[13px] text-[#64748B] mb-2">
                  <Repeat2 className="w-3.5 h-3.5" />
                  <span>Reposted from {rtWallet ? (
                    <button type="button" onClick={() => navigateToProfile(rtWallet)} className="font-semibold text-[#1A1A2E] hover:text-[#2563EB] transition-colors cursor-pointer">{rtAuthor}</button>
                  ) : (
                    <span className="font-semibold text-[#1A1A2E]">{rtAuthor}</span>
                  )}</span>
                </div>
                <div className="border border-[#E2E8F0] rounded-xl px-4 py-3 bg-[#F8FAFC]">
                  <RichContent content={rtContent} />
                </div>
              </div>
            );
          }
          // Legacy format: 🔁 Repost from @user:\n\n"content"
          const legacyMatch = renderContent.match(/^\u{1F501}\s*Repost from (@\w+):\s*[\\n]*\s*"?([\s\S]*?)"?\s*$/u);
          if (legacyMatch) {
            const rtAuthor = legacyMatch[1];
            const rtContent = legacyMatch[2].replace(/\\n/g, '').replace(/^"|"$/g, '').trim();
            const rtUsername = rtAuthor.replace(/^@/, "").toLowerCase();
            const rtWallet = Object.entries(profileMap).find(([, p]) => p?.username?.toLowerCase() === rtUsername)?.[0];
            return (
              <div>
                <div className="flex items-center gap-1.5 text-[13px] text-[#64748B] mb-2">
                  <Repeat2 className="w-3.5 h-3.5" />
                  <span>Reposted from {rtWallet ? (
                    <button type="button" onClick={() => navigateToProfile(rtWallet)} className="font-semibold text-[#1A1A2E] hover:text-[#2563EB] transition-colors cursor-pointer">{rtAuthor}</button>
                  ) : (
                    <span className="font-semibold text-[#1A1A2E]">{rtAuthor}</span>
                  )}</span>
                </div>
                <div className="border border-[#E2E8F0] rounded-xl px-4 py-3 bg-[#F8FAFC]">
                  <RichContent content={rtContent} />
                </div>
              </div>
            );
          }
          return <RichContent content={renderContent} />;
        })()}
      </div>

      {/* Reaction pills (show aggregated reactions) */}
      {postReactions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-0 sm:pl-14 mb-3">
          {Object.entries(reactionCounts).map(([typeStr, count]) => {
            const typeIdx = Number(typeStr);
            const r = REACTIONS[typeIdx];
            if (!r) return null;
            const isMyReaction = myReactionType === typeIdx;
            return (
              <span
                key={typeIdx}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border transition-all ${
                  isMyReaction
                    ? `${r.activeBg} ${r.text} border-current`
                    : `${r.bg} ${r.text} border-transparent`
                }`}
              >
                {r.emoji} {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Actions — hidden behind paywall for locked paid posts */}
      {isPaid && !isUnlocked ? (
        <div className="flex items-center gap-2 pl-0 sm:pl-14 border-t border-[#F1F5F9] pt-3">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-[#94A3B8]">Unlock this post to like, comment & share</span>
        </div>
      ) : (
      <div className="flex items-center gap-0.5 sm:gap-1 pl-0 sm:pl-14 border-t border-[#F1F5F9] pt-3">
        <button
          onClick={handleLike}
          disabled={!isConnected || hasLiked || liking}
          className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
            hasLiked
              ? "text-red-500 bg-red-50"
              : liking
                ? "text-red-400 bg-red-50 opacity-60"
                : "text-[#94A3B8] hover:text-red-500 hover:bg-red-50 active:bg-red-50"
          } disabled:cursor-not-allowed`}
        >
          <Heart className={`w-4 h-4 ${hasLiked ? "fill-red-500" : ""} ${liking ? "animate-pulse" : ""}`} />
          {totalLikes}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
            showComments
              ? "text-[#2563EB] bg-[#EFF6FF]"
              : "text-[#94A3B8] hover:text-[#2563EB] hover:bg-[#EFF6FF] active:bg-[#EFF6FF]"
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          {totalComments}
        </button>

        {/* Reaction button */}
        <div className="relative">
          <button
            onClick={() => myReactionType !== null ? handleRemoveReaction() : setShowReactions(!showReactions)}
            disabled={!isConnected || reacting}
            className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
              myReactionType !== null
                ? `${REACTIONS[myReactionType]?.text || "text-[#94A3B8]"} ${REACTIONS[myReactionType]?.bg || "bg-[#F1F5F9]"} hover:opacity-70`
                : showReactions
                  ? "text-[#EA580C] bg-orange-50"
                  : "text-[#94A3B8] hover:text-[#EA580C] hover:bg-orange-50 active:bg-orange-50"
            } disabled:cursor-not-allowed`}
            title={myReactionType !== null ? "Click to remove reaction" : "React"}
          >
            {myReactionType !== null ? REACTIONS[myReactionType]?.emoji : "😀"}
            {postReactions.length > 0 && <span>{postReactions.length}</span>}
          </button>

          {/* Reaction picker popup */}
          {showReactions && !reacting && myReactionType === null && (
            <div className="absolute bottom-full left-0 mb-2 flex gap-1 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-2 z-50 animate-fade-in">
              {REACTIONS.map((r, idx) => (
                <button
                  key={idx}
                  onClick={() => handleReaction(idx)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:${r.activeBg} hover:scale-110 active:scale-95 transition-all`}
                  title={r.label}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
          {reacting && (
            <div className="absolute bottom-full left-0 mb-2 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-2 z-50">
              <span className="text-xs text-[#64748B] animate-pulse">{myReactionType !== null ? "Removing..." : "Sending..."}</span>
            </div>
          )}
        </div>

        {/* Tip button — hidden on own posts */}
        {!isMe && (
          <div className="relative">
            <button
              onClick={() => setShowTip(!showTip)}
              disabled={!isConnected || tipping}
              className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
                tipping
                  ? "text-emerald-400 bg-emerald-50 opacity-60"
                  : showTip
                    ? "text-emerald-600 bg-emerald-50"
                    : tipInfo?.myTip
                      ? "text-emerald-500 bg-emerald-50"
                      : "text-[#94A3B8] hover:text-emerald-600 hover:bg-emerald-50 active:bg-emerald-50"
              } disabled:cursor-not-allowed`}
              title="Tip this creator"
            >
              <Coins className={`w-4 h-4 ${tipping ? "animate-pulse" : ""}`} />
              {tipInfo ? `${tipInfo.totalAmount.toFixed(2)}` : "Tip"}
            </button>

            {/* Tip picker popup */}
            {showTip && !tipping && (
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-3 z-50 animate-fade-in min-w-[200px]">
                <p className="text-xs font-semibold text-[#1E293B] mb-2">Send a tip 💸</p>
                <div className="flex gap-1.5 mb-2">
                  {[0.01, 0.05, 0.1, 0.5].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => handleTip(amt)}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 transition-all"
                    >
                      {amt} SOL
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0.001"
                    placeholder="Custom"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-xs border border-[#E2E8F0] bg-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-emerald-300"
                    onKeyDown={(e) => { if (e.key === "Enter" && tipAmount) handleTip(parseFloat(tipAmount)); }}
                  />
                  <button
                    onClick={() => tipAmount && handleTip(parseFloat(tipAmount))}
                    disabled={!tipAmount}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Repost — blocked for paid posts */}
        {isPaid ? (
          <button
            disabled
            className="touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] opacity-30 cursor-not-allowed"
            title="Paid posts cannot be reposted"
          >
            <Repeat2 className="w-4 h-4" />
          </button>
        ) : (
        <button
          disabled={reposting || !isConnected}
          onClick={async () => {
            if (reposting || !program || !walletKey) return;
            setReposting(true);
            try {
              const authorName = profile?.username ? `@${profile.username}` : post.author.slice(0, 8);
              const preview = post.content.length > 200 ? post.content.slice(0, 200) + "..." : post.content;
              const repostContent = `RT|${authorName}|${preview}`;
              onRepost(repostContent);
              toast("success", "Reposted! 🔁", "Creating on-chain repost...");
            } catch (err: any) {
              toast("error", "Repost failed", err?.message?.slice(0, 80) || "Try again");
            }
            setReposting(false);
          }}
          className="touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:bg-[#F0FDF4] transition-all disabled:opacity-40"
        >
          <Repeat2 className="w-4 h-4" />
        </button>
        )}

        {/* Share — don't leak paid content */}
        <button
          onClick={async () => {
            const authorName = profile?.username ? `@${profile.username}` : post.author.slice(0, 8);
            const shareContent = isPaid ? `🔒 Paid post by ${authorName} on Shyft — unlock to view` : (post.content.length > 80 ? post.content.slice(0, 80) + "..." : post.content);
            const shareUrl = `https://www.shyft.lol`;
            const shareText = `"${shareContent}" — ${authorName} on Shyft\n\n${shareUrl}`;
            if (navigator.share) {
              try {
                await navigator.share({ title: `${authorName} on Shyft`, text: `"${shareContent}"`, url: shareUrl });
              } catch {}
            } else {
              await navigator.clipboard.writeText(shareText);
              toast("success", "Link copied! 🔗", "Share it with your friends");
            }
          }}
          className="touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#2563EB] hover:bg-[#EBF4FF] active:bg-[#EBF4FF] transition-all"
        >
          <Share2 className="w-4 h-4" />
        </button>

        {/* Delete (own posts only) */}
        {isMe && (
          <button
            disabled={deleting}
            onClick={async () => {
              if (deleting || !program || !walletKey) return;
              if (!confirm("Delete this post? This is permanent and on-chain.")) return;
              setDeleting(true);
              try {
                const postId = Number(post.postId);
                await program.deletePost(postId);
                toast("success", "Post deleted 🗑️", "Removed from chain, rent refunded");
                onDelete();
              } catch (err: any) {
                console.error("Delete error:", err);
                if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
                  toast("error", "Delete cancelled", "You rejected the transaction");
                } else {
                  toast("error", "Delete failed", err?.message?.slice(0, 80) || "Please try again");
                }
              }
              setDeleting(false);
            }}
            className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
              deleting
                ? "text-red-400 bg-red-50 opacity-60"
                : "text-[#94A3B8] hover:text-red-500 hover:bg-red-50 active:bg-red-50"
            } disabled:cursor-not-allowed`}
          >
            <Trash2 className={`w-4 h-4 ${deleting ? "animate-pulse" : ""}`} />
          </button>
        )}

        {/* Flex Earnings — auto-fetches total received SOL */}
        {isMe && (
          <button
            disabled={flexing}
            onClick={async () => {
              if (flexing || !walletKey) return;
              setFlexing(true);
              try {
                const res = await fetch(`/api/tips-received?wallet=${walletKey.toBase58()}`);
                const data = await res.json();
                if (!res.ok || !data.totalSol) {
                  toast("error", "Couldn't fetch earnings", data.error || "Try again");
                  setFlexing(false);
                  return;
                }
                const myName = currentUser?.username || profile?.username || "someone";
                const amt = data.totalSol;
                const count = data.tipCount;
                const flexUrl = `https://www.shyft.lol/tip?user=${encodeURIComponent(myName)}&amount=${amt}&tips=${count}`;
                const flexText = `💸 @${myName} earned ${amt} SOL in tips on Shyft!\n\nGet tipped for your posts →\n\n${flexUrl}`;
                if (navigator.share) {
                  try {
                    await navigator.share({ title: `💸 @${myName} earned ${amt} SOL on Shyft`, text: flexText });
                  } catch {}
                } else {
                  await navigator.clipboard.writeText(flexText);
                  toast("success", "Copied to clipboard! 💸", "Paste on X to flex");
                }
              } catch (err: any) {
                toast("error", "Flex failed", err?.message?.slice(0, 60) || "Try again");
              }
              setFlexing(false);
            }}
            className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all ${
              flexing
                ? "text-emerald-400 bg-emerald-50 opacity-60"
                : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200"
            }`}
            title="Share your tip earnings"
          >
            <TrendingUp className={`w-4 h-4 ${flexing ? "animate-pulse" : ""}`} />
            {flexing ? "Loading..." : "Flex"}
          </button>
        )}

        <a
          href={`https://explorer.solana.com/address/${post.publicKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`ml-auto text-[10px] hover:underline text-[#2563EB]`}
        >
          View on Explorer
        </a>
      </div>
      )}

      {/* On-chain comments section — hidden for locked paid posts */}
      {showComments && !(isPaid && !isUnlocked) && (
        <div className="mt-3 pl-0 sm:pl-14 space-y-3">
          {postComments.length === 0 && !commenting && (
            <p className="text-xs text-[#94A3B8] text-center py-2">No comments yet. Be the first to comment on-chain!</p>
          )}
          {postComments.map((comment) => {
            const commenterProfile = profileMap[comment.author];
            const commenterName = commenterProfile?.displayName || comment.author.slice(0, 4) + "..." + comment.author.slice(-4);
            const isMyComment = comment.author === myAddr;
            return (
              <div key={comment.publicKey} className="flex gap-2 animate-fade-in">
                <ProfileHoverCard walletAddress={comment.author} profile={commenterProfile}>
                <button type="button" onClick={() => navigateToProfile(comment.author)} className="flex-shrink-0 group cursor-pointer">
                {commenterProfile?.avatarUrl ? (
                  <img src={commenterProfile.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 group-hover:ring-2 group-hover:ring-[#2563EB]/30 transition-all" />
                ) : (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 group-hover:ring-2 group-hover:ring-[#2563EB]/30 transition-all ${
                    isMyComment ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-[#F1F5F9] text-[#64748B]"
                  }`}>
                    {commenterName.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}
                </button>
                </ProfileHoverCard>
                <div className="flex-1 bg-[#F8FAFC] rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => navigateToProfile(comment.author)} className="text-xs font-semibold text-[#1A1A2E] hover:text-[#2563EB] transition-colors cursor-pointer">{isMyComment ? "You" : commenterName}</button>
                    <span className="text-[10px] text-[#94A3B8]">
                      {Number(comment.createdAt) > 0 ? timeAgo(Number(comment.createdAt) * 1000) : "recently"}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-medium text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded-full">
                      <Globe className="w-2 h-2" /> on-chain
                    </span>
                    {isMyComment && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!program || !walletKey) return;
                          if (!confirm("Delete this comment?")) return;
                          try {
                            const postAuthor = new PublicKey(post.author);
                            const postId = Number(post.postId);
                            const commentIdx = Number(comment.commentIndex);
                            await program.deleteComment(postAuthor, postId, commentIdx);
                            toast("success", "Comment deleted 🗑️", "Removed from chain");
                            onCommentAdded();
                          } catch (err: any) {
                            console.error("Delete comment error:", err);
                            toast("error", "Delete failed", err?.message?.slice(0, 80) || "Try again");
                          }
                        }}
                        className="ml-auto text-[#CBD5E1] hover:text-red-500 transition-colors"
                        title="Delete comment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[#475569] mt-0.5">{comment.content}</p>
                </div>
              </div>
            );
          })}
          {isConnected && (
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleComment()}
                  maxLength={100}
                  placeholder={commenting ? "Posting on-chain..." : "Write a comment..."}
                  disabled={commenting}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:opacity-50"
                />
                {commentText.length > 80 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#94A3B8]">{100 - commentText.length}</span>}
              </div>
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || commenting}
                className="touch-active w-9 h-9 rounded-lg bg-[#2563EB] text-white flex items-center justify-center hover:bg-[#1D4ED8] disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {commenting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Feed() {
  const { isConnected, currentUser } = useAppStore();
  const [newPost, setNewPost] = useState("");
  const program = useProgram();
  const { publicKey } = useWallet();
  const [onchainPosts, setOnchainPosts] = useState<any[]>([]);
  const [loadingOnchain, setLoadingOnchain] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  const [allComments, setAllComments] = useState<any[]>([]);
  const [allReactions, setAllReactions] = useState<any[]>([]);

  const [posting, setPosting] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaIsVideo, setMediaIsVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPaidPost, setIsPaidPost] = useState(false);
  const [paidPrice, setPaidPrice] = useState("0.01");

  // Fetch all public posts from Solana
  const fetchOnchainPosts = async () => {
    if (!program || !publicKey) return;
    setLoadingOnchain(true);
    try {
      const [allMapped, profiles, comments, reactions] = await Promise.all([
        program.getAllPosts(),
        program.getAllProfiles(),
        program.getAllComments(),
        program.getAllReactions(),
      ]);

      setAllComments(comments);
      setAllReactions(reactions);

      // Show all posts: free (public) + paid (private with PAID| prefix), exclude community posts
      const visiblePosts = allMapped.filter((p: any) => !p.content.startsWith("COMM|") && (!p.isPrivate || p.content.startsWith("PAID|")));
      
      console.log("📊 All posts:", allMapped.length, "Visible:", visiblePosts.length);

      setOnchainPosts(visiblePosts.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)));
      
      const map: Record<string, any> = {};
      profiles.forEach((p: any) => { map[p.owner] = p; });
      setProfileMap(map);
    } catch (err) {
      console.error("Failed to fetch on-chain posts:", err);
    }
    setLoadingOnchain(false);
  };

  useEffect(() => {
    fetchOnchainPosts();
  }, [program, publicKey]);

  // Auto-refresh feed every 30s — posts (like counts), comments, reactions
  useEffect(() => {
    if (!program || !publicKey) return;
    const interval = setInterval(() => {
      refreshFeed();
    }, 30_000);
    return () => clearInterval(interval);
  }, [program, publicKey]);

  // Refresh posts + comments + reactions (updates like counts, new posts, etc.)
  const refreshFeed = async () => {
    if (!program) return;
    try {
      const [allMapped, comments, reactions] = await Promise.all([
        program.getAllPosts(),
        program.getAllComments(),
        program.getAllReactions(),
      ]);
      setAllComments(comments);
      setAllReactions(reactions);
      const visiblePosts = allMapped.filter((p: any) => !p.content.startsWith("COMM|") && (!p.isPrivate || p.content.startsWith("PAID|")));
      setOnchainPosts(visiblePosts.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)));
    } catch (err) {
      console.error("Failed to refresh feed:", err);
    }
  };

  // Legacy alias for components that call refreshInteractions
  const refreshInteractions = refreshFeed;

  const handlePost = async () => {
    if ((!newPost.trim() && !mediaFile) || posting) return;
    if (!program || !publicKey) {
      toast("error", "Wallet not connected", "Please connect your wallet to post");
      return;
    }

    const postId = Date.now();
    let content = newPost;

    setPosting(true);
    setNewPost("");

    try {
      // Upload media first if attached
      if (mediaFile) {
        const label = mediaIsVideo ? "video" : "image";
        toast("privacy", `Uploading ${label}...`, `Hosting your ${label} on IPFS`);
        try {
          const mediaUrl = await uploadMedia(mediaFile);
          content = content.trim() ? `${content.trim()}\n${mediaUrl}` : mediaUrl;
          setMediaPreview(null);
          setMediaFile(null);
          setMediaIsVideo(false);
        } catch (err: any) {
          toast("error", `${mediaIsVideo ? "Video" : "Image"} upload failed`, err.message || "Try again");
          setPosting(false);
          setNewPost(content);
          return;
        }
      }

      toast("privacy", "Posting...", "Publishing to your feed");

      if (!publicKey || program.provider.wallet.publicKey?.toBase58() !== publicKey.toBase58()) {
        throw new Error("Wallet disconnected during post creation");
      }

      const profile = await program.getProfile(publicKey);
      if (!profile) {
        throw new Error("You need to create a profile first. Go to the Profile tab to set up your account.");
      }

      // Prepend PAID| prefix for paid posts
      if (isPaidPost) {
        const price = parseFloat(paidPrice);
        if (isNaN(price) || price <= 0) {
          toast("error", "Invalid price", "Please enter a valid price greater than 0");
          setPosting(false);
          setNewPost(content);
          return;
        }
        content = `PAID|${price}|${content}`;
      }

      const sig = await program.createPost(postId, content, isPaidPost);
      toast("success", isPaidPost ? `Paid post live! 🔒 ${paidPrice} SOL` : "Post confirmed on Solana", `TX: ${sig.slice(0, 8)}...`);

      // Reset paid post state
      setIsPaidPost(false);
      setPaidPrice("0.01");

      setTimeout(() => fetchOnchainPosts(), 1500);
    } catch (err: any) {
      console.error("On-chain post error:", err);
      const errorMsg = err?.message?.slice(0, 150) || "Unknown error";

      setNewPost(content);
      
      if (errorMsg.includes("User rejected") || errorMsg.includes("rejected the request")) {
        toast("error", "Post cancelled", "You rejected the transaction");
      } else if (errorMsg.includes("need to create a profile")) {
        toast("error", "Profile required", errorMsg);
      } else if (errorMsg.includes("Provided seeds")) {
        toast("error", "Account error", "Account setup issue - make sure your profile is created and try again");
      } else if (errorMsg.includes("insufficient funds") || errorMsg.includes("insufficient") || errorMsg.includes("for rent")) {
        toast("error", "Insufficient SOL", "Your wallet needs more SOL to pay for this transaction. Fund your wallet from the Profile tab.");
      } else if (errorMsg.includes("simulation failed")) {
        toast("error", "Transaction failed", errorMsg.includes("Provided seeds") ? "PDA derivation issue - reconnect wallet" : "Please try again or check your wallet connection");
      } else {
        toast("error", "On-chain post failed", errorMsg);
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
      {/* Compose */}
      {isConnected && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5">
          <div className="flex gap-3">
            {(() => {
              const myAvatar = (publicKey && profileMap[publicKey.toBase58()]?.avatarUrl) || currentUser?.avatarUrl;
              const myName = (publicKey && profileMap[publicKey.toBase58()]?.displayName) || currentUser?.displayName;
              if (myAvatar) return <img src={myAvatar} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0" />;
              if (myName) return <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#DBEAFE] flex items-center justify-center text-lg font-bold text-[#2563EB] flex-shrink-0">{myName.charAt(0).toUpperCase()}</div>;
              return <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#DBEAFE] animate-pulse flex-shrink-0" />;
            })()}
            <div className="flex-1 min-w-0">
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                maxLength={200}
                placeholder="What's happening?"
                className="w-full resize-none bg-transparent text-[15px] focus:outline-none placeholder:text-[#94A3B8] min-h-[60px] sm:min-h-[80px] leading-relaxed"
              />
              {/* Media preview (image or video) */}
              {mediaPreview && (
                <div className="relative mt-2 rounded-2xl overflow-hidden border border-[#E2E8F0] inline-block">
                  {mediaIsVideo ? (
                    <video src={mediaPreview} className="max-h-[200px] max-w-full object-cover rounded-2xl" controls muted />
                  ) : (
                    <img src={mediaPreview} alt="Preview" className="max-h-[200px] max-w-full object-cover rounded-2xl" />
                  )}
                  <button
                    onClick={() => { setMediaPreview(null); setMediaFile(null); setMediaIsVideo(false); }}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}
            </div>
          </div>
          {newPost.length > 160 && (
            <div className="flex justify-end mt-1">
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                newPost.length > 180 ? "border-red-400 text-red-500" : "border-[#E2E8F0] text-[#94A3B8]"
              }`}>
                {200 - newPost.length}
              </div>
            </div>
          )}
          {/* Paid post banner */}
          {isPaidPost && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl animate-fade-in">
              <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-xs font-medium text-amber-700">Paid post — viewers pay to unlock</span>
              <div className="ml-auto flex items-center gap-1.5">
                <input
                  type="number"
                  value={paidPrice}
                  onChange={(e) => setPaidPrice(e.target.value)}
                  min="0.001"
                  step="0.01"
                  className="w-20 text-xs font-bold text-amber-700 bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0.01"
                />
                <span className="text-xs font-bold text-amber-600">SOL</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F1F5F9] gap-3">
            <div className="flex items-center gap-1">
              <MediaBar
                onMediaSelected={(url, file) => {
                  setMediaPreview(url);
                  if (file) {
                    setMediaFile(file);
                    setMediaIsVideo(isVideoFile(file));
                  }
                }}
                disabled={posting || uploading}
              />
              {/* Paid post toggle */}
              <button
                type="button"
                onClick={() => setIsPaidPost(!isPaidPost)}
                className={`touch-active flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isPaidPost
                    ? "text-amber-600 bg-amber-50 border border-amber-200"
                    : "text-[#94A3B8] hover:text-amber-600 hover:bg-amber-50"
                }`}
                title={isPaidPost ? "Make post free" : "Make post paid"}
              >
                {isPaidPost ? <Lock className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
              </button>
            </div>
            {uploading && (
              <span className="text-xs text-[#2563EB] animate-pulse">Uploading...</span>
            )}
            <button
              onClick={handlePost}
              disabled={(!newPost.trim() && !mediaFile) || posting}
              className={`touch-active px-5 py-2 text-white text-[15px] font-bold rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm ${
                isPaidPost
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-200"
                  : "bg-[#2563EB] hover:bg-[#1D4ED8] shadow-blue-200"
              }`}
            >
              {posting ? "Posting..." : isPaidPost ? `Post · ${paidPrice} SOL` : "Post"}
            </button>
          </div>
        </div>
      )}

      {/* Posts */}
      {!isConnected && (
        <div className="bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] rounded-2xl p-8 text-center border border-[#E2E8F0]">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-[#2563EB]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Welcome to Shyft</h3>
          <p className="text-sm text-[#64748B] max-w-sm mx-auto">Connect your wallet to start posting, chatting, and sending private payments on Solana.</p>
        </div>
      )}

      {/* On-chain public posts from all users */}
      {isConnected && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#2563EB]" />
              <span className="text-xs font-semibold text-[#64748B]">Public Feed — On-Chain Posts</span>
            </div>
            <button
              onClick={fetchOnchainPosts}
              disabled={loadingOnchain}
              className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loadingOnchain ? "animate-spin" : ""}`} />
              {loadingOnchain ? "Loading..." : "Refresh"}
            </button>
          </div>

          {onchainPosts.length === 0 && !loadingOnchain && (
            <div className="bg-[#F8FAFC] rounded-xl p-6 text-center border border-[#E2E8F0]">
              <p className="text-sm text-[#94A3B8]">No public posts on-chain yet. Be the first!</p>
            </div>
          )}

          {onchainPosts.map((post) => {
            const profile = profileMap[post.author];
            const isMe = publicKey ? post.author === publicKey.toBase58() : false;
            return (
              <OnChainPostCard
                key={post.publicKey}
                post={post}
                profile={profile}
                isMe={isMe}
                program={program}
                allComments={allComments}
                allReactions={allReactions}
                profileMap={profileMap}
                onCommentAdded={refreshInteractions}
                onReactionAdded={refreshInteractions}
                onRepost={async (content: string) => {
                  if (!program || !publicKey) return;
                  const postId = Date.now();
                  try {
                    await program.createPost(postId, content, false);
                    toast("success", "Repost published! 🔁", "On-chain");
                    setTimeout(() => fetchOnchainPosts(), 1500);
                  } catch (err: any) {
                    toast("error", "Repost failed", err?.message?.slice(0, 80) || "Try again");
                  }
                }}
                onDelete={() => {
                  setTimeout(() => fetchOnchainPosts(), 1500);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
