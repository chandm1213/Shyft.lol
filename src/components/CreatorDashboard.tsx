"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Heart,
  MessageCircle,
  DollarSign,
  Eye,
  Users,
  Clock,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Calendar,
  RefreshCw,
  Shield,
  Lock,
  Globe,
  Star,
  Zap,
  Trophy,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAppStore } from "@/lib/store";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@/hooks/usePrivyWallet";
import type { Payment } from "@/types";

/* ──────────────────── helpers ──────────────────── */

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatSOL(amount: number): string {
  return amount.toFixed(4);
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

/* ──────────────────── Stat Card ──────────────────── */

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
  trendLabel,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: "bg-[#EFF6FF]", icon: "text-[#2563EB]", border: "border-[#BFDBFE]" },
    green: { bg: "bg-[#F0FDF4]", icon: "text-[#16A34A]", border: "border-[#BBF7D0]" },
    purple: { bg: "bg-[#F5F3FF]", icon: "text-[#7C3AED]", border: "border-[#DDD6FE]" },
    orange: { bg: "bg-[#FFF7ED]", icon: "text-[#EA580C]", border: "border-[#FED7AA]" },
    red: { bg: "bg-[#FEF2F2]", icon: "text-[#DC2626]", border: "border-[#FECACA]" },
    teal: { bg: "bg-[#F0FDFA]", icon: "text-[#0D9488]", border: "border-[#99F6E4]" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`bg-white rounded-2xl border ${c.border} p-4 sm:p-5 hover:shadow-md transition-shadow duration-300`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        {trend && trendLabel && (
          <div
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
              trend === "up"
                ? "bg-[#F0FDF4] text-[#16A34A]"
                : trend === "down"
                ? "bg-[#FEF2F2] text-[#DC2626]"
                : "bg-[#F1F5F9] text-[#64748B]"
            }`}
          >
            {trend === "up" ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : trend === "down" ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : null}
            {trendLabel}
          </div>
        )}
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-[#1A1A2E] mb-0.5">{value}</p>
      <p className="text-xs text-[#64748B]">{title}</p>
      {subtitle && <p className="text-[10px] text-[#94A3B8] mt-0.5">{subtitle}</p>}
    </div>
  );
}

/* ──────────────────── Main Component ──────────────────── */

export default function CreatorDashboard() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { payments: localPayments, isConnected } = useAppStore();

  // Data state
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [onChainPayments, setOnChainPayments] = useState<Payment[]>([]);
  const [onChainComments, setOnChainComments] = useState<any[]>([]);
  const [onChainReactions, setOnChainReactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());

  /* ── Fetch all data ── */
  const loadDashboardData = useCallback(async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    try {
      const [posts, profileList, payments, comments, reactions] = await Promise.all([
        program.getAllPostsIncludingDelegated(),
        program.getAllProfiles(),
        program.getAllPaymentsForUser(),
        program.getAllComments(),
        program.getAllReactions(),
      ]);

      const profileMap: Record<string, any> = {};
      profileList.forEach((p: any) => {
        profileMap[p.owner] = p;
      });

      const myAddr = publicKey.toBase58();
      const mine = posts.filter((p: any) => p.author === myAddr);

      setAllPosts(posts);
      setMyPosts(mine);
      setProfiles(profileMap);
      setOnChainPayments(payments);
      setOnChainComments(comments);
      setOnChainReactions(reactions);
      setLastRefreshed(Date.now());
    } catch (err) {
      console.error("Dashboard data load failed:", err);
    }
    setLoading(false);
  }, [program, publicKey]);

  useEffect(() => {
    if (program && publicKey && isConnected) {
      loadDashboardData();
    }
  }, [program, publicKey, isConnected, loadDashboardData]);

  /* ── Computed analytics ── */
  const analytics = useMemo(() => {
    const myAddr = publicKey?.toBase58() || "";

    // Posts
    const totalPosts = myPosts.length;
    const publicPosts = myPosts.filter((p) => !p.isPrivate);
    const privatePosts = myPosts.filter((p) => p.isPrivate);
    const delegatedPosts = myPosts.filter((p) => p.isDelegated);

    // Likes
    const totalLikes = myPosts.reduce((sum, p) => sum + Number(p.likes || 0), 0);

    // Comments (on-chain)
    const totalComments = myPosts.reduce((sum, p) => {
      const comments = onChainComments.filter((c: any) => c.post === p.publicKey);
      return sum + comments.length;
    }, 0);

    // Reactions (on-chain)
    const totalReactions = myPosts.reduce((sum, p) => {
      const reactions = onChainReactions.filter((r: any) => r.post === p.publicKey);
      return sum + reactions.length;
    }, 0);

    // Earnings
    const receivedPayments = onChainPayments.filter((p) => p.recipient === "me" || p.recipient === myAddr);
    const sentPayments = onChainPayments.filter((p) => p.sender === "me" || p.sender === myAddr);
    const totalEarned = receivedPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalSpent = sentPayments.reduce((sum, p) => sum + p.amount, 0);

    // Engagement rate = (likes + comments + reactions) / total posts
    const engagementRate = totalPosts > 0 ? ((totalLikes + totalComments + totalReactions) / totalPosts).toFixed(1) : "0";

    // Post performance (sorted by engagement)
    const postPerformance = myPosts
      .map((p) => {
        const comments = onChainComments.filter((c: any) => c.post === p.publicKey);
        const reactions = onChainReactions.filter((r: any) => r.post === p.publicKey);
        return {
          ...p,
          totalLikes: Number(p.likes || 0),
          totalComments: comments.length,
          totalReactions: reactions.length,
          engagement: Number(p.likes || 0) + comments.length + reactions.length,
          createdAtMs: Number(p.createdAt) * 1000,
        };
      })
      .sort((a, b) => b.engagement - a.engagement);

    // Top engagers (from comments)
    // Top engagers (from on-chain comments + reactions)
    const engagerMap: Record<string, { address: string; interactions: number }> = {};
    for (const post of myPosts) {
      const comments = onChainComments.filter((c: any) => c.post === post.publicKey);
      for (const comment of comments) {
        if (comment.author === myAddr) continue;
        if (!engagerMap[comment.author]) {
          engagerMap[comment.author] = { address: comment.author, interactions: 0 };
        }
        engagerMap[comment.author].interactions++;
      }
      const reactions = onChainReactions.filter((r: any) => r.post === post.publicKey);
      for (const reaction of reactions) {
        if (reaction.user === myAddr) continue;
        if (!engagerMap[reaction.user]) {
          engagerMap[reaction.user] = { address: reaction.user, interactions: 0 };
        }
        engagerMap[reaction.user].interactions++;
      }
    }
    const topEngagers = Object.values(engagerMap).sort((a, b) => b.interactions - a.interactions).slice(0, 5);

    // Activity by day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayActivity = dayNames.map((name) => ({ name, posts: 0, engagement: 0 }));
    for (const post of myPosts) {
      const date = new Date(Number(post.createdAt) * 1000);
      const day = date.getDay();
      dayActivity[day].posts++;
      const comments = onChainComments.filter((c: any) => c.post === post.publicKey);
      dayActivity[day].engagement += Number(post.likes || 0) + comments.length;
    }

    // Activity by hour
    const hourActivity = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, "0")}:00`,
      posts: 0,
      engagement: 0,
    }));
    for (const post of myPosts) {
      const date = new Date(Number(post.createdAt) * 1000);
      const hour = date.getHours();
      hourActivity[hour].posts++;
      const comments = onChainComments.filter((c: any) => c.post === post.publicKey);
      hourActivity[hour].engagement += Number(post.likes || 0) + comments.length;
    }

    // Post type breakdown for pie chart
    const typeBreakdown = [
      { name: "Public", value: publicPosts.length, color: "#2563EB" },
      { name: "Private", value: privatePosts.length, color: "#16A34A" },
      { name: "TEE Delegated", value: delegatedPosts.length, color: "#7C3AED" },
    ].filter((t) => t.value > 0);

    // Posting streak (consecutive days with posts)
    const postDates = new Set(
      myPosts.map((p) => {
        const d = new Date(Number(p.createdAt) * 1000);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (postDates.has(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    // Earnings timeline
    const earningsTimeline: { date: string; amount: number }[] = [];
    const paymentsByDate: Record<string, number> = {};
    for (const p of receivedPayments) {
      const d = new Date(p.timestamp);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      paymentsByDate[key] = (paymentsByDate[key] || 0) + p.amount;
    }
    // last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      earningsTimeline.push({ date: key, amount: paymentsByDate[key] || 0 });
    }

    // Engagement over time (last 7 days)
    const engagementTimeline: { date: string; likes: number; comments: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      let dayLikes = 0;
      let dayComments = 0;
      for (const post of myPosts) {
        const pd = new Date(Number(post.createdAt) * 1000);
        const postKey = `${pd.getFullYear()}-${pd.getMonth()}-${pd.getDate()}`;
        if (postKey === dateKey) {
          dayLikes += Number(post.likes || 0);
          const c = onChainComments.filter((cm: any) => cm.post === post.publicKey);
          dayComments += c.length;
        }
      }
      engagementTimeline.push({ date: dayLabel, likes: dayLikes, comments: dayComments });
    }

    return {
      totalPosts,
      publicPosts: publicPosts.length,
      privatePosts: privatePosts.length,
      delegatedPosts: delegatedPosts.length,
      totalLikes,
      totalComments,
      totalReactions,
      totalEarned,
      totalSpent,
      engagementRate,
      postPerformance,
      topEngagers,
      dayActivity,
      hourActivity,
      typeBreakdown,
      streak,
      earningsTimeline,
      engagementTimeline,
      receivedPayments,
      sentPayments,
    };
  }, [myPosts, onChainComments, onChainReactions, onChainPayments, publicKey]);

  /* ── Not connected state ── */
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF] flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-[#2563EB]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Creator Dashboard</h3>
          <p className="text-sm text-[#64748B]">Connect your wallet to view your content analytics</p>
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1A1A2E]">Creator Dashboard</h2>
            <p className="text-xs text-[#64748B]">Loading your analytics...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] mb-3" />
              <div className="h-8 bg-[#F1F5F9] rounded-lg w-16 mb-2" />
              <div className="h-3 bg-[#F1F5F9] rounded w-24" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 animate-pulse">
          <div className="h-48 bg-[#F1F5F9] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1A1A2E]">Creator Dashboard</h2>
            <p className="text-xs text-[#64748B]">
              Last updated {timeAgo(lastRefreshed)}
            </p>
          </div>
        </div>
        <button
          onClick={loadDashboardData}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] bg-[#EFF6FF] px-3 py-2 rounded-xl transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Total Posts"
          value={analytics.totalPosts}
          subtitle={`${analytics.publicPosts} public · ${analytics.privatePosts} private`}
          icon={BarChart3}
          color="blue"
          trend={analytics.totalPosts > 0 ? "up" : "neutral"}
          trendLabel={analytics.streak > 0 ? `${analytics.streak}d streak` : undefined}
        />
        <StatCard
          title="Total Likes"
          value={analytics.totalLikes}
          subtitle={`${analytics.engagementRate} avg per post`}
          icon={Heart}
          color="red"
          trend={analytics.totalLikes > 0 ? "up" : "neutral"}
          trendLabel={analytics.totalLikes > 0 ? "On-chain" : undefined}
        />
        <StatCard
          title="Comments"
          value={analytics.totalComments}
          subtitle={`${analytics.totalReactions} reactions · ${analytics.topEngagers.length} engagers`}
          icon={MessageCircle}
          color="purple"
          trend={analytics.totalComments > 0 ? "up" : "neutral"}
          trendLabel={analytics.totalComments > 0 ? "On-chain" : undefined}
        />
        <StatCard
          title="SOL Earned"
          value={`◎${formatSOL(analytics.totalEarned)}`}
          subtitle={`${analytics.receivedPayments.length} payments received`}
          icon={DollarSign}
          color="green"
          trend={analytics.totalEarned > 0 ? "up" : "neutral"}
          trendLabel={analytics.totalEarned > 0 ? "Tips" : undefined}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Engagement Over Time */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-semibold text-[#1A1A2E]">Engagement (7 days)</h3>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" /> Likes
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#7C3AED]" /> Comments
              </span>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={analytics.engagementTimeline}>
                <defs>
                  <linearGradient id="likesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="commentsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "12px",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                />
                <Area type="monotone" dataKey="likes" stroke="#2563EB" strokeWidth={2} fill="url(#likesGrad)" />
                <Area type="monotone" dataKey="comments" stroke="#7C3AED" strokeWidth={2} fill="url(#commentsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Earnings Chart */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#16A34A]" />
              <h3 className="text-sm font-semibold text-[#1A1A2E]">Earnings (7 days)</h3>
            </div>
            <span className="text-xs font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-1 rounded-lg">
              ◎{formatSOL(analytics.totalEarned)} total
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={analytics.earningsTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "12px",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value: any) => [`◎${formatSOL(Number(value || 0))}`, "Earned"]}
                />
                <Bar dataKey="amount" fill="#16A34A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Second Row: Post Types + Best Posting Times */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Post Type Breakdown */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-[#7C3AED]" />
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Content Mix</h3>
          </div>
          {analytics.typeBreakdown.length > 0 ? (
            <>
              <div className="h-40 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={analytics.typeBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      dataKey="value"
                      stroke="none"
                    >
                      {analytics.typeBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "white",
                        border: "1px solid #E2E8F0",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {analytics.typeBreakdown.map((t) => (
                  <div key={t.name} className="flex items-center gap-1.5 text-xs text-[#64748B]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                    {t.name} ({t.value})
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-[#94A3B8]">
              No posts yet
            </div>
          )}
        </div>

        {/* Best Posting Times */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#EA580C]" />
              <h3 className="text-sm font-semibold text-[#1A1A2E]">Activity by Day</h3>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" /> Posts
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#EA580C]" /> Engagement
              </span>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={analytics.dayActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "12px",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar dataKey="posts" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="engagement" fill="#EA580C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Post Performance Table */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#2563EB]" />
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Post Performance</h3>
          </div>
          <span className="text-xs text-[#94A3B8]">{analytics.postPerformance.length} posts</span>
        </div>

        {analytics.postPerformance.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="text-left text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Content</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4 text-center">❤️</th>
                  <th className="pb-3 pr-4 text-center">💬</th>
                  <th className="pb-3 text-right">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {analytics.postPerformance.slice(0, 10).map((post, idx) => (
                  <tr key={post.publicKey} className="group hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 pr-4">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                          idx === 0
                            ? "bg-[#FEF3C7] text-[#D97706]"
                            : idx === 1
                            ? "bg-[#F1F5F9] text-[#64748B]"
                            : idx === 2
                            ? "bg-[#FFF7ED] text-[#EA580C]"
                            : "bg-[#F8FAFC] text-[#94A3B8]"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-sm text-[#1A1A2E] truncate max-w-[200px] sm:max-w-[300px]">
                        {post.content}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      {post.isPrivate ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" /> Private
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                          <Globe className="w-2.5 h-2.5" /> Public
                        </span>
                      )}
                      {post.isDelegated && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#7C3AED] bg-[#F5F3FF] px-1.5 py-0.5 rounded-full ml-1">
                          <Shield className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <span className="text-sm font-medium text-[#1A1A2E]">{post.totalLikes}</span>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <span className="text-sm font-medium text-[#1A1A2E]">{post.totalComments}</span>
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-xs text-[#94A3B8]">
                        {post.createdAtMs > 0 ? timeAgo(post.createdAtMs) : "recently"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-6 h-6 text-[#94A3B8]" />
            </div>
            <p className="text-sm text-[#94A3B8]">No posts yet. Create your first post to see analytics!</p>
          </div>
        )}
      </div>

      {/* Bottom Row: Top Engagers + Creator Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Top Engagers */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[#0D9488]" />
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Top Engagers</h3>
          </div>
          {analytics.topEngagers.length > 0 ? (
            <div className="space-y-3">
              {analytics.topEngagers.map((engager, idx) => {
                const profile = profiles[engager.address];
                const displayName = profile?.displayName || truncateAddress(engager.address);
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <div
                    key={engager.address}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F8FAFC] transition-colors"
                  >
                    <span className="text-lg w-7 text-center">
                      {idx < 3 ? medals[idx] : <span className="text-xs text-[#94A3B8]">#{idx + 1}</span>}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1] flex items-center justify-center text-sm">
                      {profile?.displayName?.charAt(0) || "👤"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1A1A2E] truncate">{displayName}</p>
                      <p className="text-[10px] text-[#94A3B8]">
                        {engager.interactions} interaction{engager.interactions !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#0D9488] bg-[#F0FDFA] px-2 py-1 rounded-lg">
                      <Zap className="w-3 h-3" />
                      {engager.interactions}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#F0FDFA] flex items-center justify-center mx-auto mb-2">
                <Users className="w-5 h-5 text-[#94A3B8]" />
              </div>
              <p className="text-xs text-[#94A3B8]">No engagers yet. Keep posting!</p>
            </div>
          )}
        </div>

        {/* Creator Score + Quick Stats */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Creator Score</h3>
          </div>

          {(() => {
            // Calculate a creator score out of 100
            const postScore = Math.min(analytics.totalPosts * 5, 25);
            const likeScore = Math.min(analytics.totalLikes * 3, 25);
            const commentScore = Math.min(analytics.totalComments * 4, 20);
            const earningsScore = Math.min(analytics.totalEarned * 50, 15);
            const streakScore = Math.min(analytics.streak * 3, 15);
            const total = Math.min(Math.round(postScore + likeScore + commentScore + earningsScore + streakScore), 100);

            const getGrade = (score: number) => {
              if (score >= 80) return { grade: "S", color: "#D97706", bg: "#FEF3C7", label: "Legendary" };
              if (score >= 60) return { grade: "A", color: "#16A34A", bg: "#F0FDF4", label: "Expert" };
              if (score >= 40) return { grade: "B", color: "#2563EB", bg: "#EFF6FF", label: "Rising Star" };
              if (score >= 20) return { grade: "C", color: "#7C3AED", bg: "#F5F3FF", label: "Getting Started" };
              return { grade: "D", color: "#94A3B8", bg: "#F1F5F9", label: "Newcomer" };
            };

            const { grade, color, bg, label } = getGrade(total);

            return (
              <>
                {/* Score Circle */}
                <div className="flex items-center justify-center mb-5">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(total / 100) * 264} 264`}
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black" style={{ color }}>
                        {total}
                      </span>
                      <span className="text-[10px] font-medium text-[#94A3B8]">/100</span>
                    </div>
                  </div>
                </div>

                {/* Grade Badge */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span
                    className="text-lg font-black px-3 py-1 rounded-xl"
                    style={{ color, background: bg }}
                  >
                    {grade}
                  </span>
                  <span className="text-sm font-semibold text-[#1A1A2E]">{label}</span>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-2">
                  {[
                    { label: "Content", score: postScore, max: 25, icon: "📝" },
                    { label: "Likes", score: likeScore, max: 25, icon: "❤️" },
                    { label: "Comments", score: commentScore, max: 20, icon: "💬" },
                    { label: "Earnings", score: earningsScore, max: 15, icon: "💰" },
                    { label: "Streak", score: streakScore, max: 15, icon: "🔥" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="text-xs w-5 text-center">{item.icon}</span>
                      <span className="text-[10px] font-medium text-[#64748B] w-16">{item.label}</span>
                      <div className="flex-1 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${(item.score / item.max) * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-[#94A3B8] w-8 text-right">
                        {Math.round(item.score)}/{item.max}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Recent Payments Received */}
      {analytics.receivedPayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#16A34A]" />
              <h3 className="text-sm font-semibold text-[#1A1A2E]">Recent Tips Received</h3>
            </div>
            <span className="text-xs text-[#94A3B8]">{analytics.receivedPayments.length} total</span>
          </div>
          <div className="space-y-2">
            {analytics.receivedPayments.slice(0, 5).map((payment) => {
              const senderProfile = profiles[payment.sender];
              const senderName = senderProfile?.displayName || truncateAddress(payment.sender);
              return (
                <div
                  key={payment.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0]"
                >
                  <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center text-sm">
                    💸
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1A2E]">
                      <span className="text-[#16A34A]">+◎{formatSOL(payment.amount)}</span> from {senderName}
                    </p>
                    <p className="text-[10px] text-[#94A3B8]">{timeAgo(payment.timestamp)}</p>
                  </div>
                  <span className="text-[10px] font-medium text-[#16A34A] bg-white px-2 py-1 rounded-lg border border-[#BBF7D0]">
                    Completed
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Posting Heatmap (Hour of Day) */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-4 h-4 text-[#EA580C]" />
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Posting Heatmap (Hour of Day)</h3>
        </div>
        <div className="grid grid-cols-12 gap-1 sm:gap-1.5">
          {analytics.hourActivity.map((h) => {
            const maxPosts = Math.max(...analytics.hourActivity.map((x) => x.posts), 1);
            const intensity = h.posts / maxPosts;
            return (
              <div key={h.hour} className="flex flex-col items-center gap-1">
                <div
                  className="w-full aspect-square rounded-md transition-colors"
                  style={{
                    backgroundColor:
                      h.posts === 0
                        ? "#F1F5F9"
                        : `rgba(37, 99, 235, ${0.2 + intensity * 0.8})`,
                  }}
                  title={`${h.label}: ${h.posts} posts, ${h.engagement} engagement`}
                />
                {h.hour % 3 === 0 && (
                  <span className="text-[8px] text-[#94A3B8]">{h.hour}h</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <span className="text-[9px] text-[#94A3B8]">Less</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 1].map((opacity, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: `rgba(37, 99, 235, ${opacity})` }}
              />
            ))}
          </div>
          <span className="text-[9px] text-[#94A3B8]">More</span>
        </div>
      </div>

      {/* Footer insight */}
      <div className="bg-gradient-to-r from-[#EFF6FF] to-[#F5F3FF] rounded-2xl border border-[#BFDBFE] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-[#2563EB]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">Creator Insight</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {analytics.totalPosts === 0
                ? "Start posting to build your creator analytics! Your engagement, earnings, and creator score will appear here."
                : analytics.totalLikes > analytics.totalPosts * 2
                ? `🔥 Great engagement! Your posts average ${analytics.engagementRate} interactions each. Keep creating quality content!`
                : analytics.streak > 3
                ? `🔥 ${analytics.streak}-day posting streak! Consistency is key to building your audience.`
                : analytics.totalEarned > 0
                ? `💰 You've earned ◎${formatSOL(analytics.totalEarned)} in tips! Your content is valued by the community.`
                : `📈 You have ${analytics.totalPosts} posts. Try posting consistently and engaging with others to boost your creator score!`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
