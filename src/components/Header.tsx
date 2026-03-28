"use client";

import { Shield, LogOut, Wallet } from "lucide-react";
import { useWallet } from "@/hooks/usePrivyWallet";
import { useAppStore } from "@/lib/store";
import { useProgram } from "@/hooks/useProgram";
import { useEffect, useState } from "react";
import ProfileSetup from "@/components/ProfileSetup";

const titles: Record<string, string> = {
  feed: "Feed",
  chat: "Chat",
  friends: "People",
  payments: "Payments",
  dashboard: "Creator Dashboard",
  profile: "Profile",
};

const subtitles: Record<string, string> = {
  feed: "Your encrypted feed",
  chat: "End-to-end encrypted",
  friends: "Follow & discover people",
  payments: "Private via PER",
  dashboard: "Your content analytics",
  profile: "On-chain identity",
};

export default function Header() {
  const { activeTab, setCurrentUser, setConnected } = useAppStore();
  const { publicKey, connected, login, logout, ready } = useWallet();
  const program = useProgram();
  const [showSetup, setShowSetup] = useState(false);
  const [checkedProfile, setCheckedProfile] = useState(false);

  useEffect(() => {
    setConnected(connected);
    if (!connected || !publicKey) {
      setCurrentUser(null);
      setCheckedProfile(false);
      return;
    }

    // Check for existing on-chain profile
    if (program && !checkedProfile) {
      program.getProfile(publicKey).then((profile: any) => {
        setCheckedProfile(true);
        if (profile && profile.username && profile.displayName) {
          // Use on-chain profile
          setCurrentUser({
            publicKey: publicKey.toBase58(),
            username: profile.username,
            displayName: profile.displayName,
            avatar: profile.avatarUrl || "🔒",
            bio: profile.bio || "",
            isPrivate: profile.isPrivate || false,
            followerCount: Number(profile.followerCount?.toString() || 0),
            followingCount: Number(profile.followingCount?.toString() || 0),
            createdAt: Number(profile.createdAt?.toString() || Date.now()),
            avatarUrl: profile.avatarUrl || "",
            bannerUrl: profile.bannerUrl || "",
          });
        } else {
          // No profile — show setup
          setShowSetup(true);
        }
      }).catch(() => {
        setCheckedProfile(true);
        setShowSetup(true);
      });
    }
  }, [connected, publicKey, program, checkedProfile, setConnected, setCurrentUser]);

  return (
    <>
      <header className="relative z-10 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center justify-between px-3 sm:px-4 md:px-8 py-2.5 sm:py-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#16A34A] flex items-center justify-center flex-shrink-0">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-[#1A1A2E] truncate">{titles[activeTab] || "Feed"}</h2>
              <p className="text-[10px] sm:text-xs text-[#64748B] truncate">
                <span className="sm:hidden">{subtitles[activeTab] || "Encrypted via PER"}</span>
                <span className="hidden sm:inline">End-to-end encrypted via MagicBlock PER</span>
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 ml-2">
            {connected ? (
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] rounded-lg transition-colors"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={login}
                disabled={!ready}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {showSetup && connected && (
        <ProfileSetup onComplete={() => setShowSetup(false)} />
      )}
    </>
  );
}
