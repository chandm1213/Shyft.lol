"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle, Share2, Lock, Globe, Send, Shield, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { toast } from "@/components/Toast";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { ShyftClient, clearRpcCache, SessionOpts } from "@/lib/program";
import { useSessionKey, SessionKeyState } from "@/hooks/useSessionKey";

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
  variant,
  allComments,
  allReactions,
  profileMap,
  onCommentAdded,
  onReactionAdded,
  sessionState,
}: {
  post: any;
  profile: any;
  isMe: boolean;
  program: ShyftClient | null;
  variant: "public" | "private";
  allComments: { publicKey: string; post: string; author: string; commentIndex: string; content: string; createdAt: string }[];
  allReactions: { publicKey: string; post: string; user: string; reactionType: number; createdAt: string }[];
  profileMap: Record<string, any>;
  onCommentAdded: () => void;
  onReactionAdded: () => void;
  sessionState: SessionKeyState;
}) {
  const { likedPosts, addLikedPost, isConnected, currentUser } = useAppStore();
  const { publicKey: walletKey } = useWallet();
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [liking, setLiking] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [localLikeBoost, setLocalLikeBoost] = useState(0);

  const hasLiked = likedPosts.includes(post.publicKey);

  /** Get session opts — auto-creates session if needed (1 wallet sign, then all free) */
  const getSessionOpts = async (): Promise<SessionOpts | undefined> => {
    if (sessionState.isActive && sessionState.sessionKeypair && sessionState.sessionTokenPda) {
      return {
        sessionKeypair: sessionState.sessionKeypair,
        sessionTokenPda: sessionState.sessionTokenPda,
        authority: new PublicKey(walletKey!.toBase58()),
      };
    }
    // Auto-create session on first interaction
    console.log("🔑 No active session — creating one...");
    const result = await sessionState.createSession();
    if (result) {
      return {
        sessionKeypair: result.keypair,
        sessionTokenPda: result.tokenPda,
        authority: new PublicKey(walletKey!.toBase58()),
      };
    }
    // Session creation failed or user rejected — fall back to no session (wallet signs each TX)
    console.warn("🔑 Session creation failed — falling back to wallet signing");
    return undefined;
  };
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

  const displayName = isMe
    ? "You"
    : profile?.displayName && profile.displayName !== "You" && profile.displayName !== "Anonymous"
      ? profile.displayName
      : post.author.slice(0, 4) + "..." + post.author.slice(-4);
  const username = isMe
    ? "you"
    : profile?.username && profile.username !== "you" && profile.username !== "anon"
      ? profile.username
      : post.author.slice(0, 8);

  const handleLike = async () => {
    if (!program || !isConnected || hasLiked || liking) return;
    setLiking(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      const session = await getSessionOpts();
      await program.likePost(authorPubkey, postId, session);
      addLikedPost(post.publicKey);
      setLocalLikeBoost((prev) => prev + 1);
      toast("success", "Liked! ❤️", "Recorded on-chain — visible to everyone");
    } catch (err: any) {
      console.error("Like error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Like cancelled", "You rejected the transaction");
      } else {
        toast("error", "Like failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setLiking(false);
  };

  const handleComment = async () => {
    if (!commentText.trim() || !currentUser || !program || commenting) return;
    setCommenting(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      const commentIndex = Date.now(); // unique index
      const session = await getSessionOpts();
      await program.createComment(authorPubkey, postId, commentIndex, commentText.trim(), session);
      setCommentText("");
      toast("success", "Comment posted! 💬", "Your comment is on-chain — everyone can see it");
      onCommentAdded();
    } catch (err: any) {
      console.error("Comment error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Comment cancelled", "You rejected the transaction");
      } else {
        toast("error", "Comment failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setCommenting(false);
  };

  const handleReaction = async (reactionType: number) => {
    if (!program || !isConnected || reacting || myReactionType !== null) return;
    setReacting(true);
    try {
      const authorPubkey = new PublicKey(post.author);
      const postId = Number(post.postId);
      const session = await getSessionOpts();
      await program.reactToPost(authorPubkey, postId, reactionType, session);
      setShowReactions(false);
      toast("success", `Reacted ${REACTIONS[reactionType].emoji}`, "Your reaction is on-chain!");
      onReactionAdded();
    } catch (err: any) {
      console.error("Reaction error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("rejected the request")) {
        toast("error", "Reaction cancelled", "You rejected the transaction");
      } else {
        toast("error", "Reaction failed", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setReacting(false);
  };

  const isPublic = variant === "public";

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5 mb-3 sm:mb-4 animate-fade-in hover:shadow-md transition-shadow duration-300">
      {/* Author */}
      <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-lg sm:text-xl border-2 border-white shadow-sm flex-shrink-0 ${
          isMe
            ? "bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE]"
            : isPublic
              ? "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]"
              : "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]"
        }`}>
          {isMe ? "🔒" : isPublic ? "👤" : "👥"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="font-semibold text-[#1A1A2E] text-sm truncate">{displayName}</span>
            <span className="text-xs text-[#94A3B8] truncate">@{username}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-[#94A3B8]">
              {post.createdAt !== "0" ? timeAgo(Number(post.createdAt) * 1000) : "recently"}
            </span>
            {isPublic ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                <Globe className="w-2.5 h-2.5" /> On-Chain
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Friends Only
              </span>
            )}
            {post.isDelegated && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#7C3AED] bg-[#F5F3FF] px-2 py-0.5 rounded-full">
                <Shield className="w-2.5 h-2.5" /> TEE
              </span>
            )}
          </div>
        </div>
        {!isPublic && (
          <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-[#16A34A]" />
          </div>
        )}
      </div>

      {/* Content */}
      <p className="text-[#1A1A2E] text-sm leading-relaxed mb-3 pl-0 sm:pl-14">{post.content}</p>

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
            onClick={() => setShowReactions(!showReactions)}
            disabled={!isConnected || myReactionType !== null}
            className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
              myReactionType !== null
                ? `${REACTIONS[myReactionType]?.text || "text-[#94A3B8]"} ${REACTIONS[myReactionType]?.bg || "bg-[#F1F5F9]"}`
                : showReactions
                  ? "text-[#EA580C] bg-orange-50"
                  : "text-[#94A3B8] hover:text-[#EA580C] hover:bg-orange-50 active:bg-orange-50"
            } disabled:cursor-not-allowed`}
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
              <span className="text-xs text-[#64748B] animate-pulse">Sending...</span>
            </div>
          )}
        </div>

        <button className="touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:bg-[#F0FDF4] transition-all">
          <Share2 className="w-4 h-4" />
        </button>
        <a
          href={`https://explorer.solana.com/address/${post.publicKey}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className={`ml-auto text-[10px] hover:underline ${isPublic ? "text-[#2563EB]" : "text-[#16A34A]"}`}
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
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  isMyComment ? "bg-[#EFF6FF]" : "bg-[#F1F5F9]"
                }`}>
                  {isMyComment ? "🔒" : "💬"}
                </div>
                <div className="flex-1 bg-[#F8FAFC] rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#1A1A2E]">{isMyComment ? "You" : commenterName}</span>
                    <span className="text-[10px] text-[#94A3B8]">
                      {Number(comment.createdAt) > 0 ? timeAgo(Number(comment.createdAt) * 1000) : "recently"}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-medium text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded-full">
                      <Globe className="w-2 h-2" /> on-chain
                    </span>
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
                  maxLength={140}
                  placeholder={commenting ? "Posting on-chain..." : "Write a comment..."}
                  disabled={commenting}
                  className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:opacity-50"
                />
                {commentText.length > 100 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#94A3B8]">{140 - commentText.length}</span>}
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
  const { isConnected, friendsOnlyDefault } = useAppStore();
  const [newPost, setNewPost] = useState("");
  const [isPrivate, setIsPrivate] = useState(friendsOnlyDefault);
  const program = useProgram();
  const { publicKey } = useWallet();
  const sessionState = useSessionKey();
  const [onchainPosts, setOnchainPosts] = useState<any[]>([]);
  const [privatePostsFromFriends, setPrivatePostsFromFriends] = useState<any[]>([]);
  const [loadingOnchain, setLoadingOnchain] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  const [friendList, setFriendList] = useState<PublicKey[]>([]);
  const [allComments, setAllComments] = useState<any[]>([]);
  const [allReactions, setAllReactions] = useState<any[]>([]);

  const [posting, setPosting] = useState(false);

  // Sync default privacy when user changes it in Profile settings
  useEffect(() => {
    setIsPrivate(friendsOnlyDefault);
  }, [friendsOnlyDefault]);

  // Fetch all public posts from Solana + private posts from friends
  const fetchOnchainPosts = async () => {
    if (!program || !publicKey) return;
    setLoadingOnchain(true);
    clearRpcCache(); // Always fetch fresh data
    try {
      // Get user's friend list
      const userFriendList = await program.getFriendList(publicKey);
      const friends: PublicKey[] = userFriendList?.friends || [];
      console.log("🔍 Friends list:", friends.map(f => f.toBase58()));
      setFriendList(friends);

      // Fetch ALL posts (including delegated to TEE) and profiles in one go
      const [allMapped, profiles, comments, reactions] = await Promise.all([
        program.getAllPostsIncludingDelegated(),
        program.getAllProfiles(),
        program.getAllComments(),
        program.getAllReactions(),
      ]);

      setAllComments(comments);
      setAllReactions(reactions);

      // Split into public and private
      const publicPosts = allMapped.filter((p: any) => !p.isPrivate);
      const allPrivatePosts = allMapped.filter((p: any) => p.isPrivate);
      
      console.log("📊 All posts:", allMapped.length, "Public:", publicPosts.length, "Private:", allPrivatePosts.length);

      // Collect private posts visible to this user
      const myAddress = publicKey.toBase58();
      const privatePosts: any[] = [];
      
      // 1. Always include your own private posts
      const myPrivate = allPrivatePosts.filter((p: any) => p.author === myAddress);
      console.log("🔒 Your private posts:", myPrivate.length);
      privatePosts.push(...myPrivate);
      
      // 2. Check mutual friendship — batch all at once with Promise.all
      const mutualResults = await Promise.all(
        friends.map(async (friend) => {
          try {
            const friendFL = await program.getFriendList(friend);
            const friendFriends = friendFL?.friends || [];
            const isMutual = friendFriends.some((f: PublicKey) => f.equals(publicKey));
            return { friend, isMutual };
          } catch {
            return { friend, isMutual: false };
          }
        })
      );

      for (const { friend, isMutual } of mutualResults) {
        if (isMutual) {
          const friendAddr = friend.toBase58();
          const friendPrivate = allPrivatePosts.filter((p: any) => p.author === friendAddr);
          console.log(`✓ Mutual friend ${friendAddr.slice(0, 8)}... — ${friendPrivate.length} private posts`);
          privatePosts.push(...friendPrivate);
        }
      }

      console.log("🎯 Total private posts to display:", privatePosts.length);
      setOnchainPosts(publicPosts.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)));
      setPrivatePostsFromFriends(privatePosts.sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)));
      
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

  // Auto-refresh interactions every 15s so other users see new comments/reactions
  useEffect(() => {
    if (!program || !publicKey) return;
    const interval = setInterval(() => {
      refreshInteractions();
    }, 15_000);
    return () => clearInterval(interval);
  }, [program, publicKey]);

  // Light refresh: just comments + reactions (no full post re-fetch)
  const refreshInteractions = async () => {
    if (!program) return;
    try {
      // Force clear cache so we get fresh data
      clearRpcCache();
      const [comments, reactions] = await Promise.all([
        program.getAllComments(),
        program.getAllReactions(),
      ]);
      setAllComments(comments);
      setAllReactions(reactions);
    } catch (err) {
      console.error("Failed to refresh interactions:", err);
    }
  };

  const handlePost = async () => {
    if (!newPost.trim() || posting) return;
    if (!program || !publicKey) {
      toast("error", "Wallet not connected", "Please connect your wallet to post");
      return;
    }

    const postId = Date.now();
    const content = newPost;
    const privacy = isPrivate;

    setPosting(true);
    setNewPost("");

    toast("privacy", "Posting...", privacy ? "Creating private post with MagicBlock TEE" : "Publishing to your feed");

    // On-chain call
    try {
      // Double-check wallet is still connected before sending transaction
      if (!publicKey || program.provider.wallet.publicKey?.toBase58() !== publicKey.toBase58()) {
        throw new Error("Wallet disconnected during post creation");
      }

      // Check if profile exists first
      const profile = await program.getProfile(publicKey);
      if (!profile) {
        throw new Error("You need to create a profile first. Go to the Profile tab to set up your account.");
      }

      // Build session opts (shared by both public and private paths)
      let session: SessionOpts | undefined;
      if (sessionState.isActive && sessionState.sessionKeypair && sessionState.sessionTokenPda) {
        session = {
          sessionKeypair: sessionState.sessionKeypair,
          sessionTokenPda: sessionState.sessionTokenPda,
          authority: publicKey,
        };
      } else {
        // Try to auto-create session (1 wallet popup)
        const result = await sessionState.createSession();
        if (result) {
          session = {
            sessionKeypair: result.keypair,
            sessionTokenPda: result.tokenPda,
            authority: publicKey,
          };
        }
      }

      if (privacy) {
        const result = await program.createPrivatePost(postId, content, friendList, session);
        toast("success", session ? "Private post created in 1 TX (no popup!) 🔐🔑" : "Private post created in 1 TX! 🔐", `TX: ${result.sig.slice(0, 8)}...`);
      } else {
        const sig = await program.createPost(postId, content, false, session);
        toast("success", session ? "Post confirmed (no wallet popup!) 🔑" : "Post confirmed on Solana", `TX: ${sig.slice(0, 8)}...`);
      }

      // Refresh on-chain posts so the real post shows up immediately
      setTimeout(() => fetchOnchainPosts(), 1500);
    } catch (err: any) {
      console.error("On-chain post error:", err);
      const errorMsg = err?.message?.slice(0, 150) || "Unknown error";

      // Restore content so user doesn't lose it
      setNewPost(content);
      
      // Provide helpful error messages
      if (errorMsg.includes("User rejected") || errorMsg.includes("rejected the request")) {
        toast("error", "Post cancelled", "You rejected the transaction");
      } else if (errorMsg.includes("need to create a profile")) {
        toast("error", "Profile required", errorMsg);
      } else if (errorMsg.includes("Provided seeds")) {
        toast("error", "Account error", "Account setup issue - make sure your profile is created and try again");
      } else if (errorMsg.includes("insufficient funds")) {
        toast("error", "Insufficient SOL", "You need SOL to pay for the transaction");
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
          <textarea
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            maxLength={280}
            placeholder="What's on your mind? Your thoughts are encrypted..."
            className="w-full resize-none bg-transparent text-sm focus:outline-none placeholder:text-[#94A3B8] min-h-[60px] sm:min-h-[80px]"
          />
          {newPost.length > 200 && <div className="text-right text-[10px] text-[#94A3B8] -mt-1">{280 - newPost.length} characters left</div>}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F1F5F9] gap-3">
            <button
              onClick={() => setIsPrivate(!isPrivate)}
              className={`touch-active flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                isPrivate
                  ? "bg-[#F0FDF4] text-[#16A34A]"
                  : "bg-[#EFF6FF] text-[#2563EB]"
              }`}
            >
              {isPrivate ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {isPrivate ? "Friends Only" : "Public"}
            </button>
            <button
              onClick={handlePost}
              disabled={!newPost.trim() || posting}
              className="touch-active px-4 sm:px-5 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200"
            >
              {posting ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      )}

      {/* Session Key Status */}
      {isConnected && (
        <div className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs border ${
          sessionState.isActive
            ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]"
            : "bg-[#FFF7ED] border-[#FED7AA] text-[#EA580C]"
        }`}>
          <div className="flex items-center gap-1.5">
            <span>{sessionState.isActive ? "🔑" : "🔓"}</span>
            <span className="font-medium">
              {sessionState.isActive
                ? "Session active — no wallet popups!"
                : sessionState.isCreating
                  ? "Creating session..."
                  : "No session — first action will create one (1 sign)"
              }
            </span>
          </div>
          {sessionState.isActive && sessionState.expiresAt && (
            <span className="text-[10px] opacity-70">
              Expires {new Date(sessionState.expiresAt).toLocaleTimeString()}
            </span>
          )}
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
                variant="public"
                allComments={allComments}
                allReactions={allReactions}
                profileMap={profileMap}
                onCommentAdded={refreshInteractions}
                onReactionAdded={refreshInteractions}
                sessionState={sessionState}
              />
            );
          })}
        </div>
      )}

      {/* Friends-only private posts */}
      {isConnected && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#16A34A]" />
              <span className="text-xs font-semibold text-[#64748B]">Friends Only — Private Posts</span>
            </div>
            <span className="text-xs text-[#94A3B8]">{privatePostsFromFriends.length} posts</span>
          </div>

          {privatePostsFromFriends.length === 0 ? (
            <div className="bg-[#F0FDF4] rounded-xl p-6 text-center border border-[#DCF2E8]">
              <p className="text-sm text-[#16A34A]">
                {friendList.length === 0
                  ? "Add friends to see their private posts here"
                  : "No private posts from friends yet"}
              </p>
            </div>
          ) : (
            privatePostsFromFriends.map((post) => {
              const profile = profileMap[post.author];
              const isMe = publicKey ? post.author === publicKey.toBase58() : false;
              return (
                <OnChainPostCard
                  key={post.publicKey}
                  post={post}
                  profile={profile}
                  isMe={isMe}
                  program={program}
                  variant="private"
                  allComments={allComments}
                  allReactions={allReactions}
                  profileMap={profileMap}
                  onCommentAdded={refreshInteractions}
                  onReactionAdded={refreshInteractions}
                  sessionState={sessionState}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
