"use client";

import { useState, useEffect } from "react";
import { Shield, Lock, Users, Newspaper, Wallet, Copy, Check, EyeOff, Key, Cpu, UserPlus, X, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "@/hooks/useProgram";
import { toast } from "@/components/Toast";
import { PublicKey } from "@solana/web3.js";

export default function Profile() {
  const { currentUser, posts, payments, isConnected } = useAppStore();
  const { publicKey } = useWallet();
  const program = useProgram();
  const [onchainProfile, setOnchainProfile] = useState<any>(null);
  const [onchainFriends, setOnchainFriends] = useState<PublicKey[]>([]);
  const [hasFriendList, setHasFriendList] = useState(false);
  const { friendsOnlyDefault, setFriendsOnlyDefault } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [profilePrivate, setProfilePrivate] = useState(false);
  const [profilePermissionCreated, setProfilePermissionCreated] = useState(false);
  const [hidePaymentHistory, setHidePaymentHistory] = useState(true);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendAddress, setFriendAddress] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);

  useEffect(() => {
    if (program && publicKey) {
      program.getProfile(publicKey).then((profile: any) => {
        setOnchainProfile(profile);
        if (profile) {
          setProfilePrivate(profile.isPrivate || profile.is_private || false);
        }
      });
      program.getFriendList(publicKey).then((list: any) => {
        if (list) {
          setHasFriendList(true);
          setOnchainFriends(list.friends || []);
        }
      });
    }
  }, [program, publicKey]);

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAddFriend = async () => {
    if (!program || !friendAddress.trim()) return;
    setAddingFriend(true);
    try {
      // Validate address
      const friendPubkey = new PublicKey(friendAddress.trim());

      // Create friend list if it doesn't exist
      if (!hasFriendList) {
        await program.createFriendList();
        setHasFriendList(true);
        toast("success", "Friend list created on Solana");
      }

      const sig = await program.addFriend(friendPubkey);
      toast("success", "Friend added on-chain", `TX: ${sig.slice(0, 8)}...`);
      setOnchainFriends((prev) => [...prev, friendPubkey]);
      setFriendAddress("");
      setShowAddFriend(false);
    } catch (err: any) {
      toast("error", "Failed to add friend", err?.message?.slice(0, 60));
    }
    setAddingFriend(false);
  };

  const handleRemoveFriend = async (friend: PublicKey) => {
    if (!program) return;
    try {
      const sig = await program.removeFriend(friend);
      toast("success", "Friend removed", `TX: ${sig.slice(0, 8)}...`);
      setOnchainFriends((prev) => prev.filter((f) => !f.equals(friend)));
    } catch (err: any) {
      toast("error", "Failed to remove friend", err?.message?.slice(0, 60));
    }
  };

  const myPosts = posts.filter((p) => p.author.username === "you" || p.author.publicKey === currentUser?.publicKey);
  const myPayments = payments.filter((p) => p.sender === "me" || p.recipient === "me");

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-[#2563EB]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Your Private Profile</h3>
          <p className="text-sm text-[#64748B]">Connect your wallet to view your profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4 pt-2">
      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0]">
        <div className="h-24 sm:h-28 bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#16A34A] relative rounded-t-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzAtOS45NC04LjA2LTE4LTE4LTE4SDBodjM2YzktLjk0IDE4LTguMDYgMTgtMTh6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30 rounded-t-2xl" />
        </div>

        <div className="px-4 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end gap-3 sm:gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border-4 border-white shadow-lg flex items-center justify-center text-3xl sm:text-4xl flex-shrink-0">
              🔒
            </div>
            <div className="flex-1 pb-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-[#1A1A2E] truncate">{onchainProfile?.displayName || currentUser?.displayName || "Anonymous"}</h2>
              <p className="text-xs sm:text-sm text-[#64748B] truncate">@{onchainProfile?.username || currentUser?.username || "anon"}</p>
            </div>
          </div>

          <div className="mt-3 sm:mt-4 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#F8FAFC] rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 border border-[#E2E8F0] min-w-0">
              <Key className="w-3.5 h-3.5 text-[#94A3B8] flex-shrink-0" />
              <span className="text-[10px] sm:text-xs text-[#64748B] font-mono truncate">
                {publicKey?.toBase58() || "Not connected"}
              </span>
            </div>
            <button
              onClick={copyAddress}
              className="touch-active w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center hover:bg-[#F1F5F9] active:bg-[#E2E8F0] transition-colors flex-shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4 text-[#64748B]" />}
            </button>
          </div>

          {!onchainProfile && isConnected && (
            <button
              onClick={async () => {
                if (!program) return;
                try {
                  const sig = await program.createProfile(
                    currentUser?.username || "anon",
                    currentUser?.displayName || "Anonymous",
                    currentUser?.bio || "Privacy enthusiast"
                  );
                  toast("success", "Profile created on Solana", `TX: ${sig.slice(0, 8)}...`);
                  if (publicKey) {
                    const profile = await program.getProfile(publicKey);
                    setOnchainProfile(profile);
                  }
                } catch (err: any) {
                  toast("error", "Failed to create profile", err?.message?.slice(0, 60));
                }
              }}
              className="w-full mt-3 py-2.5 bg-gradient-to-r from-[#2563EB] to-[#16A34A] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all"
            >
              Create On-Chain Profile
            </button>
          )}

          {onchainProfile && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#F0FDF4] rounded-xl">
              <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
              <span className="text-xs text-[#15803D] font-medium">Profile stored on Solana</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3 sm:mt-4">
            <div className="bg-[#F8FAFC] rounded-xl px-2 sm:px-4 py-2.5 sm:py-3 text-center">
              <p className="text-base sm:text-lg font-bold text-[#1A1A2E]">{onchainProfile ? onchainProfile.postCount?.toString() || myPosts.length : myPosts.length}</p>
              <p className="text-[9px] sm:text-[10px] text-[#64748B] flex items-center justify-center gap-1">
                <Newspaper className="w-2.5 h-2.5" /> Posts
              </p>
            </div>
            <div className="bg-[#F8FAFC] rounded-xl px-2 sm:px-4 py-2.5 sm:py-3 text-center">
              <p className="text-base sm:text-lg font-bold text-[#1A1A2E]">{onchainFriends.length}</p>
              <p className="text-[9px] sm:text-[10px] text-[#64748B] flex items-center justify-center gap-1">
                <Users className="w-2.5 h-2.5" /> Friends
              </p>
            </div>
            <div className="bg-[#F8FAFC] rounded-xl px-2 sm:px-4 py-2.5 sm:py-3 text-center">
              <p className="text-base sm:text-lg font-bold text-[#1A1A2E]">{myPayments.length}</p>
              <p className="text-[9px] sm:text-[10px] text-[#64748B] flex items-center justify-center gap-1">
                <Wallet className="w-2.5 h-2.5" /> Payments
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Friends */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0]">
        <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-[#F1F5F9] flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">Friends</h3>
              <p className="text-[10px] sm:text-[11px] text-[#64748B] truncate">Stored on-chain — controls who sees your private posts</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className={`touch-active w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
              showAddFriend ? "bg-[#DC2626] text-white" : "bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE]"
            }`}
          >
            {showAddFriend ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          </button>
        </div>

        {showAddFriend && (
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-[#F1F5F9] animate-fade-in">
            <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Friend&apos;s Wallet Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={friendAddress}
                onChange={(e) => setFriendAddress(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 sm:px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-mono min-w-0"
              />
              <button
                onClick={handleAddFriend}
                disabled={!friendAddress.trim() || addingFriend}
                className="touch-active px-3.5 sm:px-4 py-2.5 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] disabled:opacity-40 transition-all flex-shrink-0"
              >
                {addingFriend ? "Adding..." : "Add"}
              </button>
            </div>
            <p className="text-[10px] text-[#94A3B8] mt-1.5 flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" /> Friend will be added on-chain via your program&apos;s friend list PDA
            </p>
          </div>
        )}

        <div className="divide-y divide-[#F1F5F9]">
          {onchainFriends.length === 0 && (
            <div className="px-5 py-8 text-center">
              <Users className="w-8 h-8 text-[#E2E8F0] mx-auto mb-2" />
              <p className="text-sm text-[#94A3B8]">No friends yet</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Add friends to share private posts with them</p>
            </div>
          )}
          {onchainFriends.map((friend, i) => (
            <div key={i} className="flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-2.5 sm:py-3 hover:bg-[#F8FAFC] transition-colors">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-base sm:text-lg flex-shrink-0">
                👤
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-[#1A1A2E] truncate">{friend.toBase58()}</p>
                <p className="text-[10px] text-[#94A3B8]">On-chain friend</p>
              </div>
              <button
                onClick={() => handleRemoveFriend(friend)}
                className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-[#94A3B8] hover:text-[#DC2626] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0]">
        <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-[#F1F5F9] flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-[#16A34A]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Privacy Settings</h3>
            <p className="text-[10px] sm:text-[11px] text-[#64748B] truncate">Control what others can see via PER permissions</p>
          </div>
        </div>

        <div className="divide-y divide-[#F1F5F9]">
          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 mr-3">
              <EyeOff className="w-4 h-4 text-[#64748B] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1A1A2E]">Private Profile</p>
                <p className="text-[10px] sm:text-[11px] text-[#64748B] truncate">Hide your profile from non-friends</p>
              </div>
            </div>
            <button
              onClick={async () => {
                const newValue = !profilePrivate;
                setProfilePrivate(newValue);
                if (program && onchainProfile && publicKey) {
                  try {
                    // First time: need to create permission on profile PDA before we can update it
                    if (!profilePermissionCreated) {
                      try {
                        const { getProfilePda } = await import("@/lib/program");
                        const { BN } = await import("@coral-xyz/anchor");
                        const [profilePda] = getProfilePda(publicKey);
                        const accountType = { profile: { owner: publicKey } };
                        const members = newValue
                          ? [{ flags: 7, pubkey: publicKey }]
                          : null;
                        await program.createPermission(accountType, profilePda, members);
                        setProfilePermissionCreated(true);
                        console.log("✅ Profile permission created");
                      } catch (permErr: any) {
                        // Permission might already exist — that's fine, continue with update
                        if (!permErr?.message?.includes("already in use")) {
                          console.warn("⚠️ Permission creation:", permErr?.message?.slice(0, 100));
                        }
                        setProfilePermissionCreated(true);
                      }
                    }
                    const sig = await program.updateProfilePrivacy(newValue);
                    toast("privacy", newValue ? "Profile set to private 🔐" : "Profile set to public", `TX: ${sig.slice(0, 8)}...`);
                  } catch (err: any) {
                    console.error("Privacy update failed:", err);
                    toast("error", "Privacy update failed", err?.message?.slice(0, 60));
                    setProfilePrivate(!newValue); // revert
                  }
                }
              }}
              className={`w-11 h-6 rounded-full transition-all duration-300 ${
                profilePrivate ? "bg-[#16A34A]" : "bg-[#E2E8F0]"
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                profilePrivate ? "translate-x-5.5 ml-[22px]" : "translate-x-0.5 ml-[2px]"
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 mr-3">
              <Lock className="w-4 h-4 text-[#64748B] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1A1A2E]">Friends-Only Posts</p>
                <p className="text-[10px] sm:text-[11px] text-[#64748B] truncate">Default new posts to friends only</p>
              </div>
            </div>
            <button
              onClick={() => {
                const newVal = !friendsOnlyDefault;
                setFriendsOnlyDefault(newVal);
                toast("privacy", newVal ? "New posts default to Friends Only" : "New posts default to Public", "");
              }}
              className={`w-11 h-6 rounded-full transition-all duration-300 ${
                friendsOnlyDefault ? "bg-[#16A34A]" : "bg-[#E2E8F0]"
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                friendsOnlyDefault ? "translate-x-5.5 ml-[22px]" : "translate-x-0.5 ml-[2px]"
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 mr-3">
              <Wallet className="w-4 h-4 text-[#64748B] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1A1A2E]">Hide Payment History</p>
                <p className="text-[10px] sm:text-[11px] text-[#64748B] truncate">Payment data stays in TEE only</p>
              </div>
            </div>
            <button
              onClick={() => setHidePaymentHistory(!hidePaymentHistory)}
              className={`w-11 h-6 rounded-full transition-all duration-300 ${
                hidePaymentHistory ? "bg-[#16A34A]" : "bg-[#E2E8F0]"
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                hidePaymentHistory ? "translate-x-5.5 ml-[22px]" : "translate-x-0.5 ml-[2px]"
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* PER Info */}
      <div className="bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] rounded-2xl border border-[#E2E8F0] p-4 sm:p-5">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
            <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-[#2563EB]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Powered by MagicBlock PER</h3>
            <p className="text-[10px] sm:text-[11px] text-[#64748B] truncate">Private Ephemeral Rollups on Solana</p>
          </div>
        </div>
        <div className="space-y-2 mt-3">
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            <span>Your data is encrypted inside Intel TDX hardware</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            <span>Only authorized wallets can access your content</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            <span>Permission Program controls account-level access</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
            <span>TEE Validator: tee.magicblock.app</span>
          </div>
        </div>
      </div>
    </div>
  );
}
