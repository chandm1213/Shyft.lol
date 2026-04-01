"use client";

import { useState, useEffect, useRef } from "react";
import { Shield, User, AtSign, FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useProgram } from "@/hooks/useProgram";
import { useAppStore } from "@/lib/store";
import { toast } from "@/components/Toast";
import { useWallet } from "@/hooks/usePrivyWallet";
import { checkUsername } from "@/lib/reserved-usernames";

interface ProfileSetupProps {
  onComplete: () => void;
}

export default function ProfileSetup({ onComplete }: ProfileSetupProps) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const { setCurrentUser } = useAppStore();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [usernameChecked, setUsernameChecked] = useState(false);
  const [usernameReserved, setUsernameReserved] = useState(false);
  const [reservedNeedsCode, setReservedNeedsCode] = useState(false);
  const [reservedReason, setReservedReason] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showInviteInput, setShowInviteInput] = useState(false);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset invite state when username changes
  useEffect(() => {
    setShowInviteInput(false);
    setInviteCode("");
  }, [username]);

  // Debounced username availability check
  useEffect(() => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    setUsernameChecked(false);
    setUsernameTaken(false);
    setUsernameReserved(false);
    setReservedNeedsCode(false);
    setReservedReason("");
    if (!username.trim() || username.trim().length < 2 || !program) return;

    // Check reserved list first (instant, no RPC)
    const reserved = checkUsername(username.trim(), inviteCode || undefined);
    if (reserved.blocked) {
      setUsernameReserved(true);
      setReservedNeedsCode(!!reserved.needsCode);
      setReservedReason(reserved.reason || "This username is reserved");
      setCheckingUsername(false);
      setUsernameChecked(true);
      return;
    }

    setCheckingUsername(true);
    usernameTimer.current = setTimeout(async () => {
      try {
        const taken = await program.isUsernameTaken(username.trim(), publicKey ?? undefined);
        setUsernameTaken(taken);
        setUsernameChecked(true);
      } catch {
        setUsernameChecked(false);
      }
      setCheckingUsername(false);
    }, 500);
    return () => { if (usernameTimer.current) clearTimeout(usernameTimer.current); };
  }, [username, program, publicKey, inviteCode]);

  // No wallet funding needed — treasury sponsors all transactions directly

  const handleCreate = async () => {
    if (!program || !publicKey || !username.trim() || !displayName.trim()) return;
    if (usernameTaken) {
      toast("error", "Username taken", "Try a different username");
      return;
    }
    if (usernameReserved) {
      toast("error", "Username reserved", reservedReason || "This username is reserved");
      return;
    }
    setLoading(true);
    try {
      const sig = await program.createProfile(
        username.trim(),
        displayName.trim(),
        bio.trim() || "Building on Shyft",
        inviteCode || undefined
      );
      toast("success", "Profile created on Solana!", `TX: ${sig.slice(0, 8)}...`);

      setCurrentUser({
        publicKey: publicKey.toBase58(),
        username: username.trim(),
        displayName: displayName.trim(),
        avatar: "🧑‍💻",
        bio: bio.trim() || "Building on Shyft",
        isPrivate: false,
        followerCount: 0,
        followingCount: 0,
        createdAt: Date.now(),
      });

      onComplete();
    } catch (err: any) {
      console.error("Profile creation error:", err);
      toast("error", "Failed to create profile", err?.message?.slice(0, 60));
    }
    setLoading(false);
  };

  const handleSkip = () => {
    if (!publicKey) return;
    const addr = publicKey.toBase58();
    setCurrentUser({
      publicKey: addr,
      username: addr.slice(0, 8),
      displayName: addr.slice(0, 4) + "..." + addr.slice(-4),
      avatar: "🧑‍💻",
      bio: "New to Shyft",
      isPrivate: false,
      followerCount: 0,
      followingCount: 0,
      createdAt: Date.now(),
    });
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] shadow-2xl w-full sm:max-w-md overflow-hidden animate-slide-up sm:animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#2563EB] to-[#16A34A] px-5 sm:px-6 py-6 sm:py-8 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Welcome to Shyft</h2>
          <p className="text-xs sm:text-sm text-white/80 mt-1">Set up your public profile — stored on Solana</p>
        </div>

        {/* Form */}
        <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
          <div>
            <label className="text-xs font-medium text-[#64748B] mb-1.5 flex items-center gap-1">
              <AtSign className="w-3 h-3" /> Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="satoshi"
              maxLength={16}
              className={`w-full bg-[#F8FAFC] border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
                usernameChecked && !checkingUsername
                  ? usernameTaken
                    ? "border-red-400 focus:ring-red-200 focus:border-red-400"
                    : "border-green-400 focus:ring-green-200 focus:border-green-400"
                  : "border-[#E2E8F0] focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              }`}
            />
            {username.trim().length >= 2 && (
              <div className="mt-1 space-y-1.5">
                {checkingUsername ? (
                  <span className="text-[11px] text-[#94A3B8]">Checking...</span>
                ) : usernameChecked ? (
                  usernameReserved ? (
                    <div>
                      <span className="text-[11px] text-amber-600 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> {reservedReason}
                      </span>
                      {reservedNeedsCode && !showInviteInput && (
                        <button
                          type="button"
                          onClick={() => setShowInviteInput(true)}
                          className="text-[11px] text-[#2563EB] hover:underline mt-0.5"
                        >
                          Have an invite code?
                        </button>
                      )}
                      {showInviteInput && (
                        <input
                          type="text"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value.toUpperCase().trim())}
                          placeholder="Enter invite code"
                          className="w-full mt-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      )}
                    </div>
                  ) : usernameTaken ? (
                    <span className="text-[11px] text-red-500 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Username taken
                    </span>
                  ) : (
                    <span className="text-[11px] text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Available
                    </span>
                  )
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-[#64748B] mb-1.5 flex items-center gap-1">
              <User className="w-3 h-3" /> Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Satoshi Nakamoto"
              maxLength={24}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#64748B] mb-1.5 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Bio <span className="text-[#94A3B8]">(optional)</span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Builder, creator, dreamer..."
              maxLength={64}
              rows={2}
              className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!username.trim() || !displayName.trim() || loading || usernameTaken || usernameReserved || checkingUsername}
            className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#16A34A] text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating on Solana...
              </>
            ) : (
              "Create Profile"
            )}
          </button>

          <button
            onClick={handleSkip}
            className="w-full py-2 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors"
          >
            Skip for now — use wallet address as name
          </button>

          <p className="text-[10px] text-center text-[#CBD5E1] flex items-center justify-center gap-1">
            <Shield className="w-2.5 h-2.5" /> Your profile is stored as a PDA on Solana — you own it
          </p>
        </div>
      </div>
    </div>
  );
}
