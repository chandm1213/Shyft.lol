"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle, Share2, Repeat2, Globe, Send, Shield, RefreshCw, Image as ImageIcon, X, BadgeCheck, Trash2 } from "lucide-react";

// Gold badge for OG / founder accounts
const GOLD_BADGE_USERNAMES = ["shaan"];
import { useAppStore } from "@/lib/store";
import { toast } from "@/components/Toast";
import { RichContent, MediaBar, uploadMedia, isVideoFile } from "@/components/RichContent";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@/hooks/usePrivyWallet";
import { PublicKey } from "@solana/web3.js";
import { ShyftClient, clearRpcCache } from "@/lib/program";
import ProfileHoverCard from "@/components/ProfileHoverCard";

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
function OnChainPostCard({
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
  const { likedPosts, addLikedPost, isConnected, currentUser, navigateToProfile } = useAppStore();
  const { publicKey: walletKey } = useWallet();
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [liking, setLiking] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [localLikeBoost, setLocalLikeBoost] = useState(0);
  const [reposting, setReposting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasLiked = likedPosts.includes(post.publicKey);
  const postComments = allComments.filter((c) => c.post === post.publicKey)
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  const postReactions = allReactions.filter((r) => r.post === post.publicKey);
  const totalLikes = Number(post.likes || 0) + localLikeBoost;
  const totalComments = postComments.length;

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

          </div>
        </div>
        </button>
        </ProfileHoverCard>
      </div>

      {/* Content */}
      <div className="mb-3 pl-0 sm:pl-14">
        {(() => {
          // New format: RT|@author|content
          if (post.content.startsWith("RT|")) {
            const parts = post.content.split("|");
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
          const legacyMatch = post.content.match(/^\u{1F501}\s*Repost from (@\w+):\s*[\\n]*\s*"?([\s\S]*?)"?\s*$/u);
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
          return <RichContent content={post.content} />;
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

      {/* Actions */}
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

        {/* Repost */}
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

        {/* Share */}
        <button
          onClick={async () => {
            const authorName = profile?.username ? `@${profile.username}` : post.author.slice(0, 8);
            const preview = post.content.length > 80 ? post.content.slice(0, 80) + "..." : post.content;
            const shareUrl = `https://www.shyft.lol`;
            const shareText = `"${preview}" — ${authorName} on Shyft\n\n${shareUrl}`;
            if (navigator.share) {
              try {
                await navigator.share({ title: `${authorName} on Shyft`, text: `"${preview}"`, url: shareUrl });
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

        <a
          href={`https://explorer.solana.com/address/${post.publicKey}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className={`ml-auto text-[10px] hover:underline text-[#2563EB]`}
        >
          View on Explorer
        </a>
      </div>

      {/* On-chain comments section */}
      {showComments && (
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

  // Fetch all public posts from Solana
  const fetchOnchainPosts = async () => {
    if (!program || !publicKey) return;
    setLoadingOnchain(true);
    clearRpcCache();
    try {
      const [allMapped, profiles, comments, reactions] = await Promise.all([
        program.getAllPosts(),
        program.getAllProfiles(),
        program.getAllComments(),
        program.getAllReactions(),
      ]);

      setAllComments(comments);
      setAllReactions(reactions);

      // All posts are public now
      const publicPosts = allMapped.filter((p: any) => !p.isPrivate);
      
      console.log("📊 All posts:", allMapped.length, "Public:", publicPosts.length);

      setOnchainPosts(publicPosts.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)));
      
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

  // Auto-refresh feed every 8s — posts (like counts), comments, reactions
  useEffect(() => {
    if (!program || !publicKey) return;
    const interval = setInterval(() => {
      refreshFeed();
    }, 8_000);
    return () => clearInterval(interval);
  }, [program, publicKey]);

  // Refresh posts + comments + reactions (updates like counts, new posts, etc.)
  const refreshFeed = async () => {
    if (!program) return;
    try {
      clearRpcCache();
      const [allMapped, comments, reactions] = await Promise.all([
        program.getAllPosts(),
        program.getAllComments(),
        program.getAllReactions(),
      ]);
      setAllComments(comments);
      setAllReactions(reactions);
      const publicPosts = allMapped.filter((p: any) => !p.isPrivate);
      setOnchainPosts(publicPosts.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)));
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

      const sig = await program.createPost(postId, content, false);
      toast("success", "Post confirmed on Solana", `TX: ${sig.slice(0, 8)}...`);

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
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F1F5F9] gap-3">
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
            {uploading && (
              <span className="text-xs text-[#2563EB] animate-pulse">Uploading...</span>
            )}
            <button
              onClick={handlePost}
              disabled={(!newPost.trim() && !mediaFile) || posting}
              className="touch-active px-5 py-2 bg-[#2563EB] text-white text-[15px] font-bold rounded-full hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200"
            >
              {posting ? "Posting..." : "Post"}
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
