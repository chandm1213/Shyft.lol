"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Calendar,
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  Shield,
  ExternalLink,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  BadgeCheck,
  Settings,
  Copy,
  Check,
  Globe,
  Camera,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { toast } from "@/components/Toast";
import { RichContent } from "@/components/RichContent";
import { uploadImage } from "@/components/RichContent";
import { ShyftClient, clearRpcCache } from "@/lib/program";

/* ───────── Types ───────── */
interface OnChainPost {
  publicKey: string;
  author: string;
  postId: string;
  content: string;
  likes: string;
  commentCount: string;
  createdAt: string;
  isPrivate: boolean;
  isDelegated: boolean;
}

/* ───────── Helpers ───────── */
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shortKey(key: string): string {
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/* ───────── Reactions ───────── */
const REACTIONS = [
  { emoji: "❤️", label: "Love" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "👏", label: "Clap" },
  { emoji: "💡", label: "Insightful" },
];

/* ═══════════════════════════════════════════════════════════════
   Profile Component — X/Twitter-inspired
   ═══════════════════════════════════════════════════════════════ */

export default function Profile() {
  const { currentUser, setCurrentUser, isConnected } = useAppStore();
  const program = useProgram();
  const { publicKey } = useWallet();

  /* state */
  const [loading, setLoading] = useState(true);
  const [onChainProfile, setOnChainProfile] = useState<any>(null);
  const [myPosts, setMyPosts] = useState<OnChainPost[]>([]);
  const [allComments, setAllComments] = useState<any[]>([]);
  const [allReactions, setAllReactions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "likes">("posts");
  const [copied, setCopied] = useState(false);
  const [realFollowerCount, setRealFollowerCount] = useState(0);
  const [realFollowingCount, setRealFollowingCount] = useState(0);

  /* profile creation form */
  const [showSetup, setShowSetup] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [creating, setCreating] = useState(false);

  /* edit mode */
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [editBannerPreview, setEditBannerPreview] = useState<string | null>(null);
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editBannerFile, setEditBannerFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  /* ── fetch everything ── */
  useEffect(() => {
    if (!program || !publicKey) {
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [program, publicKey]);

  async function fetchProfile() {
    if (!program || !publicKey) return;
    setLoading(true);
    try {
      const p = await program.getProfile(publicKey);
      setOnChainProfile(p);
      // Fetch real follower/following counts from FollowAccount PDAs (source of truth)
      const [followers, following] = await Promise.all([
        program.getFollowers(publicKey),
        program.getFollowing(publicKey),
      ]);
      setRealFollowerCount(followers.length);
      setRealFollowingCount(following.length);

      if (p) {
        // Validate createdAt — must be after 2020 (1577836800) to be real
        const rawTs = Number(p.createdAt);
        const validTs = rawTs > 1577836800 ? rawTs * 1000 : Date.now();
        setCurrentUser({
          publicKey: publicKey.toBase58(),
          username: p.username,
          displayName: p.displayName,
          avatar: p.avatarUrl || "",
          bio: p.bio,
          isPrivate: p.isPrivate,
          followerCount: followers.length,
          followingCount: following.length,
          createdAt: validTs,
          avatarUrl: p.avatarUrl || "",
          bannerUrl: p.bannerUrl || "",
        });
      }
      // fetch posts
      const posts = await program.getAllPostsIncludingDelegated();
      const mine = posts
        .filter((x) => x.author === publicKey.toBase58())
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      setMyPosts(mine);

      // fetch comments & reactions
      const [comments, reactions] = await Promise.all([
        program.getAllComments(),
        program.getAllReactions(),
      ]);
      setAllComments(comments);
      setAllReactions(reactions);
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
    setLoading(false);
  }

  /* ── create profile ── */
  async function handleCreate() {
    if (!program || !username.trim() || !displayName.trim()) return;
    setCreating(true);
    try {
      await program.createProfile(username.trim(), displayName.trim(), bio.trim());
      toast("success", "Profile created!", "Welcome to Shyft 🎉");
      clearRpcCache();
      setShowSetup(false);
      await fetchProfile();
    } catch (err: any) {
      console.error("Create profile error:", err);
      toast("error", "Failed to create profile", err?.message?.slice(0, 80) || "");
    }
    setCreating(false);
  }

  /* ── copy wallet ── */
  function copyWallet() {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── open edit modal ── */
  function openEditModal() {
    setEditDisplayName(profileName);
    setEditBio(profileBio);
    setEditAvatarUrl(onChainProfile?.avatarUrl || currentUser?.avatarUrl || "");
    setEditBannerUrl(onChainProfile?.bannerUrl || currentUser?.bannerUrl || "");
    setEditAvatarPreview(null);
    setEditBannerPreview(null);
    setEditAvatarFile(null);
    setEditBannerFile(null);
    setEditing(true);
  }

  /* ── pick image for avatar or banner ── */
  function pickImage(target: "avatar" | "banner") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/gif,image/webp";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast("error", "Too large", "Image must be under 10MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (target === "avatar") {
          setEditAvatarPreview(reader.result as string);
          setEditAvatarFile(file);
        } else {
          setEditBannerPreview(reader.result as string);
          setEditBannerFile(file);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  /* ── save profile ── */
  async function handleSaveProfile() {
    if (!program || saving) return;
    setSaving(true);
    try {
      let avatarUrl = editAvatarUrl;
      let bannerUrl = editBannerUrl;

      // Upload avatar if changed
      if (editAvatarFile) {
        toast("privacy", "Uploading avatar...", "");
        avatarUrl = await uploadImage(editAvatarFile);
      }
      // Upload banner if changed
      if (editBannerFile) {
        toast("privacy", "Uploading banner...", "");
        bannerUrl = await uploadImage(editBannerFile);
      }

      toast("privacy", "Saving profile...", "Writing to Solana");
      await program.updateProfile(
        editDisplayName.trim() || profileName,
        editBio.trim(),
        avatarUrl,
        bannerUrl,
      );
      toast("success", "Profile updated!", "Changes saved on-chain");
      clearRpcCache();
      setEditing(false);
      await fetchProfile();
    } catch (err: any) {
      console.error("Save profile error:", err);
      toast("error", "Failed to save", err?.message?.slice(0, 80) || "");
    }
    setSaving(false);
  }

  /* derived — use real PDA-based counts, not on-chain counters (which may be corrupt for migrated profiles) */
  const followerCount = realFollowerCount;
  const followingCount = realFollowingCount;
  const postCount = myPosts.length;
  const rawCreatedAt = Number(onChainProfile?.createdAt || 0);
  const joinDate = rawCreatedAt > 1577836800
    ? formatDate(rawCreatedAt * 1000)
    : currentUser?.createdAt && currentUser.createdAt > 1577836800000
    ? formatDate(currentUser.createdAt)
    : formatDate(Date.now());
  const profileName = onChainProfile?.displayName || currentUser?.displayName || "Anonymous";
  const profileUsername = onChainProfile?.username || currentUser?.username || "";
  const profileBio = onChainProfile?.bio || currentUser?.bio || "";
  const avatarUrl = onChainProfile?.avatarUrl || currentUser?.avatarUrl || "";
  const bannerUrl = onChainProfile?.bannerUrl || currentUser?.bannerUrl || "";

  /* ════════════ NOT CONNECTED ════════════ */
  if (!isConnected || !publicKey) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#F1F5F9] flex items-center justify-center">
            <Shield className="w-10 h-10 text-[#94A3B8]" />
          </div>
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-2">Connect your wallet</h2>
          <p className="text-[#64748B] text-sm">Connect to view your on-chain profile</p>
        </div>
      </div>
    );
  }

  /* ════════════ LOADING ════════════ */
  if (loading) {
    return (
      <div className="max-w-[600px] mx-auto animate-pulse">
        {/* Banner skeleton */}
        <div className="h-[200px] bg-[#E2E8F0] rounded-b-none" />
        <div className="px-4 pb-4 bg-white border-x border-b border-[#E2E8F0]">
          <div className="relative -mt-[42px] mb-3">
            <div className="w-[84px] h-[84px] rounded-full bg-[#E2E8F0] border-4 border-white" />
          </div>
          <div className="h-5 bg-[#E2E8F0] rounded w-32 mb-2" />
          <div className="h-4 bg-[#E2E8F0] rounded w-24 mb-4" />
          <div className="h-4 bg-[#E2E8F0] rounded w-full mb-2" />
          <div className="h-4 bg-[#E2E8F0] rounded w-3/4" />
        </div>
      </div>
    );
  }

  /* ════════════ NO PROFILE — SETUP ════════════ */
  if (!onChainProfile && !currentUser) {
    return (
      <div className="max-w-[600px] mx-auto">
        {/* Banner */}
        <div className="h-[200px] bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#60A5FA]" />
        <div className="bg-white border-x border-b border-[#E2E8F0] px-4 pb-6">
          <div className="relative -mt-[42px] mb-4">
            <div className="w-[84px] h-[84px] rounded-full bg-[#F1F5F9] border-4 border-white flex items-center justify-center text-3xl shadow-sm">
              👤
            </div>
          </div>

          {!showSetup ? (
            <div>
              <h2 className="text-xl font-extrabold text-[#1A1A2E] mb-1">Set up your profile</h2>
              <p className="text-[#64748B] text-[15px] mb-1">
                {shortKey(publicKey.toBase58())}
              </p>
              <p className="text-[#64748B] text-sm mt-3 mb-4">
                Create your on-chain profile to start posting and connecting with others.
              </p>
              <button
                onClick={() => setShowSetup(true)}
                className="px-5 py-2.5 bg-[#1A1A2E] text-white font-bold text-sm rounded-full hover:bg-[#2A2A3E] transition-colors"
              >
                Create Profile
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-extrabold text-[#1A1A2E]">Create your profile</h2>

              {/* Username */}
              <div>
                <label className="block text-[13px] font-medium text-[#64748B] mb-1.5">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] text-sm">@</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="username"
                    maxLength={15}
                    className="w-full pl-8 pr-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-[#1A1A2E] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
                  />
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-[13px] font-medium text-[#64748B] mb-1.5">Display Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  maxLength={30}
                  className="w-full px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-[#1A1A2E] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-[13px] font-medium text-[#64748B] mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell the world about yourself"
                  maxLength={160}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-[#1A1A2E] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all resize-none"
                />
                <p className="text-[11px] text-[#94A3B8] mt-1 text-right">{bio.length}/160</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowSetup(false)}
                  className="px-5 py-2.5 text-[#1A1A2E] font-bold text-sm rounded-full border border-[#E2E8F0] hover:bg-[#F1F5F9] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!username.trim() || !displayName.trim() || creating}
                  className="px-5 py-2.5 bg-[#1A1A2E] text-white font-bold text-sm rounded-full hover:bg-[#2A2A3E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? "Creating..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     MAIN PROFILE VIEW — X-style
     ═══════════════════════════════════════ */
  return (
    <div className="max-w-[600px] mx-auto min-h-screen">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-[#E2E8F0] px-4 py-2.5 flex items-center gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-[#1A1A2E] truncate leading-tight">
            {profileName}
          </h1>
          <p className="text-[13px] text-[#64748B] leading-tight">
            {postCount} post{postCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* ── Banner ── */}
      <div className="h-[200px] relative overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#60A5FA]">
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>
        )}
      </div>

      {/* ── Profile Info Section ── */}
      <div className="bg-white border-x border-[#E2E8F0] px-4 pb-4">
        {/* Avatar + Edit button row */}
        <div className="flex justify-between items-start">
          <div className="relative -mt-[42px]">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profileName}
                className="w-[84px] h-[84px] rounded-full border-4 border-white object-cover shadow-lg"
              />
            ) : (
              <div className="w-[84px] h-[84px] rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#DBEAFE] border-4 border-white flex items-center justify-center text-4xl shadow-lg font-bold text-[#2563EB]">
                {profileName.charAt(0).toUpperCase()}
              </div>
            )}
            {/* on-chain verified badge */}
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-[#2563EB] rounded-full flex items-center justify-center border-2 border-white">
              <BadgeCheck className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={openEditModal}
              className="px-4 py-1.5 rounded-full border border-[#E2E8F0] text-sm font-bold text-[#1A1A2E] hover:bg-[#F1F5F9] transition-colors"
            >
              Edit profile
            </button>
            <button
              onClick={copyWallet}
              className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center hover:bg-[#F1F5F9] transition-colors"
              title="Copy wallet address"
            >
              {copied ? (
                <Check className="w-4 h-4 text-[#16A34A]" />
              ) : (
                <Copy className="w-4 h-4 text-[#64748B]" />
              )}
            </button>
            <a
              href={`https://explorer.solana.com/address/${publicKey?.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center hover:bg-[#F1F5F9] transition-colors"
              title="View on Solana Explorer"
            >
              <ExternalLink className="w-4 h-4 text-[#64748B]" />
            </a>
          </div>
        </div>

        {/* Name & handle */}
        <div className="mt-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xl font-extrabold text-[#1A1A2E]">{profileName}</h2>
          </div>
          <p className="text-[15px] text-[#64748B]">@{profileUsername}</p>
        </div>

        {/* Bio */}
        {profileBio && (
          <p className="mt-3 text-[15px] text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
            {profileBio}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
          <span className="flex items-center gap-1 text-[13px] text-[#64748B]">
            <Globe className="w-3.5 h-3.5" />
            Solana Devnet
          </span>
          <span className="flex items-center gap-1 text-[13px] text-[#64748B]">
            <Calendar className="w-3.5 h-3.5" />
            Joined {joinDate}
          </span>
          <span className="flex items-center gap-1 text-[13px] text-[#64748B]">
            <Shield className="w-3.5 h-3.5" />
            {shortKey(publicKey?.toBase58() || "")}
          </span>
        </div>

        {/* Following / Followers */}
        <div className="flex gap-4 mt-3">
          <button className="group flex items-center gap-1 hover:underline decoration-[#1A1A2E]">
            <span className="text-sm font-bold text-[#1A1A2E]">{followingCount}</span>
            <span className="text-sm text-[#64748B] group-hover:text-[#1A1A2E] transition-colors">Following</span>
          </button>
          <button className="group flex items-center gap-1 hover:underline decoration-[#1A1A2E]">
            <span className="text-sm font-bold text-[#1A1A2E]">{followerCount}</span>
            <span className="text-sm text-[#64748B] group-hover:text-[#1A1A2E] transition-colors">
              Follower{followerCount !== 1 ? "s" : ""}
            </span>
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white border-x border-[#E2E8F0] flex">
        {(["posts", "likes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3.5 text-sm font-semibold text-center relative transition-colors ${
              activeTab === tab
                ? "text-[#1A1A2E]"
                : "text-[#64748B] hover:text-[#1A1A2E] hover:bg-[#F8FAFC]"
            }`}
          >
            {tab === "posts" ? "Posts" : "Likes"}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-[3px] bg-[#2563EB] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="border-b border-[#E2E8F0]" />

      {/* ── Posts Feed ── */}
      <div className="bg-white border-x border-[#E2E8F0]">
        {activeTab === "posts" && (
          <>
            {myPosts.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-4xl mb-3">✍️</div>
                <h3 className="text-[15px] font-bold text-[#1A1A2E] mb-1">No posts yet</h3>
                <p className="text-sm text-[#64748B]">
                  When you post, they&apos;ll show up here.
                </p>
              </div>
            ) : (
              myPosts.map((post) => (
                <ProfilePostCard
                  key={post.publicKey}
                  post={post}
                  profileName={profileName}
                  profileUsername={profileUsername}
                  avatarUrl={avatarUrl}
                  comments={allComments.filter((c) => c.post === post.publicKey)}
                  reactions={allReactions.filter((r) => r.post === post.publicKey)}
                />
              ))
            )}
          </>
        )}
        {activeTab === "likes" && (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">❤️</div>
            <h3 className="text-[15px] font-bold text-[#1A1A2E] mb-1">Coming soon</h3>
            <p className="text-sm text-[#64748B]">
              Your liked posts will appear here.
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom border ── */}
      <div className="bg-white border-x border-b border-[#E2E8F0] rounded-b-xl h-4" />

      {/* ═══ Edit Profile Modal ═══ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-16">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setEditing(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-[600px] mx-4 max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in">
            {/* Modal header */}
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => !saving && setEditing(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#F1F5F9] transition-colors"
                >
                  <X className="w-5 h-5 text-[#1A1A2E]" />
                </button>
                <h2 className="text-lg font-bold text-[#1A1A2E]">Edit profile</h2>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="px-4 py-1.5 bg-[#1A1A2E] text-white font-bold text-sm rounded-full hover:bg-[#2A2A3E] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </button>
            </div>

            {/* Banner edit */}
            <div className="h-[200px] relative overflow-hidden group">
              {editBannerPreview || editBannerUrl ? (
                <img
                  src={editBannerPreview || editBannerUrl}
                  alt="Banner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#60A5FA]" />
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => pickImage("banner")}
                  className="w-11 h-11 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
                {(editBannerPreview || editBannerUrl) && (
                  <button
                    onClick={() => { setEditBannerPreview(null); setEditBannerFile(null); setEditBannerUrl(""); }}
                    className="w-11 h-11 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
            </div>

            {/* Avatar edit */}
            <div className="px-4 -mt-[42px] mb-4 relative">
              <div className="relative w-[84px] h-[84px] group">
                {editAvatarPreview || editAvatarUrl ? (
                  <img
                    src={editAvatarPreview || editAvatarUrl}
                    alt="Avatar"
                    className="w-[84px] h-[84px] rounded-full border-4 border-white object-cover"
                  />
                ) : (
                  <div className="w-[84px] h-[84px] rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#DBEAFE] border-4 border-white flex items-center justify-center text-4xl font-bold text-[#2563EB]">
                    {editDisplayName.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}
                <button
                  onClick={() => pickImage("avatar")}
                  className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Form fields */}
            <div className="px-4 pb-6 space-y-5">
              {/* Display Name */}
              <div className="relative">
                <label className="absolute left-3 top-2 text-[11px] text-[#64748B]">Name</label>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  maxLength={64}
                  className="w-full px-3 pt-6 pb-2 bg-transparent border border-[#E2E8F0] rounded-lg text-[15px] text-[#1A1A2E] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
                />
                <span className="absolute right-3 top-2 text-[11px] text-[#94A3B8]">{editDisplayName.length}/64</span>
              </div>

              {/* Bio */}
              <div className="relative">
                <label className="absolute left-3 top-2 text-[11px] text-[#64748B]">Bio</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  maxLength={160}
                  rows={3}
                  className="w-full px-3 pt-6 pb-2 bg-transparent border border-[#E2E8F0] rounded-lg text-[15px] text-[#1A1A2E] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all resize-none"
                />
                <span className="absolute right-3 top-2 text-[11px] text-[#94A3B8]">{editBio.length}/160</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   X-style Post Card for Profile
   ═══════════════════════════════════════ */
function ProfilePostCard({
  post,
  profileName,
  profileUsername,
  avatarUrl,
  comments,
  reactions,
}: {
  post: OnChainPost;
  profileName: string;
  profileUsername: string;
  avatarUrl?: string;
  comments: any[];
  reactions: any[];
}) {
  const [showComments, setShowComments] = useState(false);
  const ts = Number(post.createdAt) * 1000;
  const likeCount = Number(post.likes || 0);
  const commentCount = comments.length;

  // Group reactions
  const reactionCounts: Record<number, number> = {};
  for (const r of reactions) {
    reactionCounts[r.reactionType] = (reactionCounts[r.reactionType] || 0) + 1;
  }
  const totalReactions = reactions.length;

  return (
    <div className="border-b border-[#E2E8F0] px-4 py-3 hover:bg-[#F8FAFC]/50 transition-colors">
      <div className="flex gap-3">
        {/* Avatar */}
        {avatarUrl ? (
          <img src={avatarUrl} alt={profileName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#DBEAFE] flex items-center justify-center text-lg font-bold text-[#2563EB] flex-shrink-0">
            {profileName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Author line */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[15px] text-[#1A1A2E] truncate">{profileName}</span>
            <BadgeCheck className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
            <span className="text-[15px] text-[#64748B] truncate">@{profileUsername}</span>
            <span className="text-[#64748B]">·</span>
            <span className="text-[13px] text-[#64748B] flex-shrink-0">{timeAgo(ts)}</span>
          </div>

          {/* Content */}
          <div className="mt-1">
            <RichContent content={post.content} />
          </div>

          {/* Reaction chips */}
          {totalReactions > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(reactionCounts).map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F1F5F9] text-xs"
                >
                  {REACTIONS[Number(type)]?.emoji} {count}
                </span>
              ))}
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between mt-2 max-w-[380px] -ml-2">
            {/* Comments */}
            <button
              onClick={() => setShowComments(!showComments)}
              className="group flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-[#EBF4FF] transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-[#64748B] group-hover:text-[#2563EB] transition-colors" />
              <span className="text-[13px] text-[#64748B] group-hover:text-[#2563EB] transition-colors">
                {commentCount || ""}
              </span>
            </button>

            {/* Repost placeholder */}
            <button className="group flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-[#F0FDF4] transition-colors">
              <Repeat2 className="w-4 h-4 text-[#64748B] group-hover:text-[#16A34A] transition-colors" />
            </button>

            {/* Likes */}
            <button className="group flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-[#FEF2F2] transition-colors">
              <Heart className="w-4 h-4 text-[#64748B] group-hover:text-[#EF4444] transition-colors" />
              <span className="text-[13px] text-[#64748B] group-hover:text-[#EF4444] transition-colors">
                {likeCount || ""}
              </span>
            </button>

            {/* Share */}
            <button className="group flex items-center px-2 py-1.5 rounded-full hover:bg-[#EBF4FF] transition-colors">
              <Share className="w-4 h-4 text-[#64748B] group-hover:text-[#2563EB] transition-colors" />
            </button>
          </div>

          {/* Comments list */}
          {showComments && comments.length > 0 && (
            <div className="mt-2 space-y-2 border-l-2 border-[#E2E8F0] pl-3 ml-1">
              {comments
                .sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt))
                .map((c: any, i: number) => (
                  <div key={i} className="text-[13px]">
                    <span className="font-semibold text-[#1A1A2E]">
                      {shortKey(c.author)}
                    </span>
                    <span className="text-[#64748B] ml-1.5">
                      {c.content}
                    </span>
                    <span className="text-[#94A3B8] ml-1.5">
                      · {timeAgo(Number(c.createdAt) * 1000)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
