"use client";

import { useState, useEffect } from "react";
import { Heart, MessageCircle, Share2, Lock, Globe, Send, Shield, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { toast } from "@/components/Toast";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import type { Post } from "@/types";

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

function PostCard({ post }: { post: Post }) {
  const { toggleLike, addComment, isConnected } = useAppStore();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const handleComment = () => {
    if (!commentText.trim()) return;
    addComment(post.id, commentText);
    setCommentText("");
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5 animate-fade-in hover:shadow-md active:shadow-sm transition-shadow duration-300">
      {/* Author */}
      <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-lg sm:text-xl border-2 border-white shadow-sm flex-shrink-0">
          {post.author.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="font-semibold text-[#1A1A2E] text-sm truncate">{post.author.displayName}</span>
            <span className="text-xs text-[#94A3B8] truncate">@{post.author.username}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-[#94A3B8]">{timeAgo(post.createdAt)}</span>
            {post.isPrivate ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Private
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                <Globe className="w-2.5 h-2.5" /> Public
              </span>
            )}
          </div>
        </div>
        {post.isPrivate && (
          <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-[#16A34A]" />
          </div>
        )}
      </div>

      {/* Content */}
      <p className="text-[#1A1A2E] text-sm leading-relaxed mb-4 pl-0 sm:pl-14">{post.content}</p>

      {/* Actions */}
      <div className="flex items-center gap-0.5 sm:gap-1 pl-0 sm:pl-14 border-t border-[#F1F5F9] pt-3">
        <button
          onClick={() => isConnected && toggleLike(post.id)}
          className={`touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
            post.isLiked
              ? "text-red-500 bg-red-50"
              : "text-[#94A3B8] hover:text-red-500 hover:bg-red-50 active:bg-red-50"
          }`}
        >
          <Heart className={`w-4 h-4 ${post.isLiked ? "fill-red-500" : ""}`} />
          {post.likes}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#2563EB] hover:bg-[#EFF6FF] active:bg-[#EFF6FF] transition-all"
        >
          <MessageCircle className="w-4 h-4" />
          {post.comments.length}
        </button>
        <button className="touch-active flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-[#94A3B8] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:bg-[#F0FDF4] transition-all">
          <Share2 className="w-4 h-4" />
          <span className="hidden xs:inline">Share</span>
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 pl-0 sm:pl-14 space-y-3">
          {post.comments.map((comment) => (
            <div key={comment.id} className="flex gap-2 animate-fade-in">
              <div className="w-7 h-7 rounded-full bg-[#F1F5F9] flex items-center justify-center text-xs flex-shrink-0">
                {comment.author.avatar}
              </div>
              <div className="flex-1 bg-[#F8FAFC] rounded-xl px-3 py-2">
                <span className="text-xs font-semibold text-[#1A1A2E]">{comment.author.displayName}</span>
                <p className="text-xs text-[#475569] mt-0.5">{comment.content}</p>
              </div>
            </div>
          ))}
          {isConnected && (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleComment()}
                placeholder="Write a comment..."
                className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
              <button
                onClick={handleComment}
                className="touch-active w-9 h-9 rounded-lg bg-[#2563EB] text-white flex items-center justify-center hover:bg-[#1D4ED8] transition-colors flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Feed() {
  const { posts, addPost, isConnected, friendsOnlyDefault } = useAppStore();
  const [newPost, setNewPost] = useState("");
  const [isPrivate, setIsPrivate] = useState(friendsOnlyDefault);
  const program = useProgram();
  const { publicKey } = useWallet();
  const [onchainPosts, setOnchainPosts] = useState<any[]>([]);
  const [privatePostsFromFriends, setPrivatePostsFromFriends] = useState<any[]>([]);
  const [loadingOnchain, setLoadingOnchain] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  const [friendList, setFriendList] = useState<PublicKey[]>([]);

  // Sync default privacy when user changes it in Profile settings
  useEffect(() => {
    setIsPrivate(friendsOnlyDefault);
  }, [friendsOnlyDefault]);

  // Fetch all public posts from Solana + private posts from friends
  const fetchOnchainPosts = async () => {
    if (!program || !publicKey) return;
    setLoadingOnchain(true);
    try {
      // Get user's friend list
      const userFriendList = await program.getFriendList(publicKey);
      const friends: PublicKey[] = userFriendList?.friends || [];
      console.log("🔍 Friends list:", friends.map(f => f.toBase58()));
      setFriendList(friends);

      // Fetch ALL posts (including delegated to TEE) and profiles in one go
      const [allMapped, profiles] = await Promise.all([
        program.getAllPostsIncludingDelegated(),
        program.getAllProfiles(),
      ]);

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
      
      // 2. Include mutual friends' private posts
      for (const friend of friends) {
        try {
          const friendFL = await program.getFriendList(friend);
          const friendFriends = friendFL?.friends || [];
          const isMutual = friendFriends.some((f: PublicKey) => f.equals(publicKey));
          
          if (isMutual) {
            const friendAddr = friend.toBase58();
            const friendPrivate = allPrivatePosts.filter((p: any) => p.author === friendAddr);
            console.log(`✓ Mutual friend ${friendAddr.slice(0, 8)}... — ${friendPrivate.length} private posts`);
            privatePosts.push(...friendPrivate);
          } else {
            console.log(`✗ Not mutual: ${friend.toBase58().slice(0, 8)}...`);
          }
        } catch (err) {
          console.error(`Failed to check friend ${friend.toBase58().slice(0, 8)}:`, err);
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

  const handlePost = async () => {
    if (!newPost.trim()) return;
    if (!program || !publicKey) {
      toast("error", "Wallet not connected", "Please connect your wallet to post");
      return;
    }

    const postId = Date.now();
    const content = newPost;
    const privacy = isPrivate;

    // Instant local update
    addPost(content, privacy);
    setNewPost("");

    toast("privacy", "Post created", privacy ? "Encrypted via PER — only friends can see this" : "Posted publicly to your feed");

    // On-chain call in background
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

      if (privacy) {
        const result = await program.createPrivatePost(postId, content, friendList);
        if (result.delegateSig) {
          toast("success", "Private post delegated to MagicBlock TEE! 🔐", `TX: ${result.createSig.slice(0, 8)}...`);
        } else if (result.permissionSig) {
          toast("success", "Private post with permission created", `TX: ${result.createSig.slice(0, 8)}...`);
        } else {
          toast("success", "Private post created on-chain", `TX: ${result.createSig.slice(0, 8)}...`);
        }
      } else {
        const sig = await program.createPost(postId, content, false);
        toast("success", "Post confirmed on Solana", `TX: ${sig.slice(0, 8)}...`);
      }
    } catch (err: any) {
      console.error("On-chain post error:", err);
      const errorMsg = err?.message?.slice(0, 150) || "Unknown error";
      
      // Provide helpful error messages
      if (errorMsg.includes("need to create a profile")) {
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
            placeholder="What's on your mind? Your thoughts are encrypted..."
            className="w-full resize-none bg-transparent text-sm focus:outline-none placeholder:text-[#94A3B8] min-h-[60px] sm:min-h-[80px]"
          />
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
              disabled={!newPost.trim()}
              className="touch-active px-4 sm:px-5 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200"
            >
              Post
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

      {/* Local posts */}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

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
            const isMe = publicKey && post.author === publicKey.toBase58();
            const displayName = isMe ? "You" : (profile?.displayName && profile.displayName !== "You" && profile.displayName !== "Anonymous" ? profile.displayName : post.author.slice(0, 4) + "..." + post.author.slice(-4));
            const username = isMe ? "you" : (profile?.username && profile.username !== "you" && profile.username !== "anon" ? profile.username : post.author.slice(0, 8));
            return (
              <div key={post.publicKey} className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5 mb-3 sm:mb-4 animate-fade-in hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-lg sm:text-xl border-2 border-white shadow-sm flex-shrink-0 ${isMe ? "bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE]" : "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]"}`}>
                    {isMe ? "🔒" : "👤"}
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
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                        <Globe className="w-2.5 h-2.5" /> On-Chain
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[#1A1A2E] text-sm leading-relaxed mb-3 pl-0 sm:pl-14">{post.content}</p>
                <div className="flex items-center gap-3 pl-0 sm:pl-14 pt-3 border-t border-[#F1F5F9] text-xs text-[#94A3B8]">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5" /> {post.likes}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" /> {post.commentCount}
                  </span>
                  <a
                    href={`https://explorer.solana.com/address/${post.publicKey}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[10px] text-[#2563EB] hover:underline"
                  >
                    View on Explorer
                  </a>
                </div>
              </div>
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
              const displayName = profile?.displayName && profile.displayName !== "You" && profile.displayName !== "Anonymous" ? profile.displayName : post.author.slice(0, 4) + "..." + post.author.slice(-4);
              const username = profile?.username && profile.username !== "you" && profile.username !== "anon" ? profile.username : post.author.slice(0, 8);
              return (
                <div key={post.publicKey} className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5 mb-3 sm:mb-4 animate-fade-in hover:shadow-md transition-shadow duration-300">
                  <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] flex items-center justify-center text-lg sm:text-xl border-2 border-white shadow-sm flex-shrink-0">
                      👥
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
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" /> Friends Only
                        </span>
                        {post.isDelegated && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#7C3AED] bg-[#F5F3FF] px-2 py-0.5 rounded-full">
                            <Shield className="w-2.5 h-2.5" /> TEE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[#1A1A2E] text-sm leading-relaxed mb-3 pl-0 sm:pl-14">{post.content}</p>
                  <div className="flex items-center gap-3 pl-0 sm:pl-14 pt-3 border-t border-[#F1F5F9] text-xs text-[#94A3B8]">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5" /> {post.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5" /> {post.commentCount}
                    </span>
                    <a
                      href={`https://explorer.solana.com/address/${post.publicKey}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-[10px] text-[#16A34A] hover:underline"
                    >
                      View on Explorer
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
