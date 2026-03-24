"use client";

import { useState, useEffect } from "react";
import { Search, UserPlus, UserCheck, UserX, Clock, Users, Check, X, RefreshCw, Globe } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { toast } from "@/components/Toast";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { clearRpcCache } from "@/lib/program";

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

interface SearchResult {
  owner: string;
  username: string;
  displayName: string;
}

interface FriendRequestData {
  publicKey: string;
  from: string;
  to: string;
  status: number;
  createdAt: string;
}

export default function Friends() {
  const { isConnected } = useAppStore();
  const program = useProgram();
  const { publicKey } = useWallet();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestData[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestData[]>([]);
  const [friends, setFriends] = useState<PublicKey[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [acceptingFrom, setAcceptingFrom] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"search" | "incoming" | "outgoing" | "list">("search");

  // Fetch all friend data
  const fetchFriendData = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    clearRpcCache();
    try {
      const [incoming, outgoing, friendList, profiles] = await Promise.all([
        program.getIncomingRequests(publicKey),
        program.getOutgoingRequests(publicKey),
        program.getFriendList(publicKey),
        program.getAllProfiles(),
      ]);

      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
      setFriends(friendList?.friends || []);

      const map: Record<string, any> = {};
      profiles.forEach((p: any) => { map[p.owner] = p; });
      setProfileMap(map);
    } catch (err) {
      console.error("Failed to fetch friend data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFriendData();
  }, [program, publicKey]);

  // Search by username
  const handleSearch = async () => {
    if (!searchQuery.trim() || !program) return;
    setSearching(true);
    try {
      const results = await program.searchByUsername(searchQuery.trim());
      // Filter out self
      const myAddr = publicKey?.toBase58() || "";
      setSearchResults(results.filter((r) => r.owner !== myAddr));
    } catch (err) {
      console.error("Search error:", err);
    }
    setSearching(false);
  };

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = setTimeout(handleSearch, 400);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, program]);

  // Send friend request
  const handleSendRequest = async (toAddress: string) => {
    if (!program || sendingTo) return;
    setSendingTo(toAddress);
    try {
      const toPubkey = new PublicKey(toAddress);
      await program.sendFriendRequest(toPubkey);
      toast("success", "Friend request sent! 🤝", "They'll see it in their incoming requests");
      setSearchQuery("");
      setSearchResults([]);
      await fetchFriendData();
    } catch (err: any) {
      console.error("Send request error:", err);
      if (err?.message?.includes("User rejected")) {
        toast("error", "Request cancelled", "You rejected the transaction");
      } else if (err?.message?.includes("already in use") || err?.message?.includes("init_if_needed")) {
        toast("error", "Already sent", "You've already sent a request to this user");
      } else {
        toast("error", "Failed to send request", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setSendingTo(null);
  };

  // Accept friend request
  const handleAccept = async (fromAddress: string) => {
    if (!program || acceptingFrom) return;
    setAcceptingFrom(fromAddress);
    try {
      const fromPubkey = new PublicKey(fromAddress);

      await program.acceptFriendRequest(fromPubkey);
      toast("success", "Friend added! 🎉", "You're now friends — you can see each other's private posts");
      await fetchFriendData();
    } catch (err: any) {
      console.error("Accept error:", err);
      if (err?.message?.includes("User rejected")) {
        toast("error", "Cancelled", "You rejected the transaction");
      } else {
        toast("error", "Failed to accept", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setAcceptingFrom(null);
  };

  // Reject friend request
  const handleReject = async (fromAddress: string, toAddress: string) => {
    if (!program || rejectingKey) return;
    setRejectingKey(fromAddress);
    try {
      const fromPubkey = new PublicKey(fromAddress);
      const toPubkey = new PublicKey(toAddress);
      await program.rejectFriendRequest(fromPubkey, toPubkey);
      toast("success", "Request rejected", "The friend request has been declined");
      await fetchFriendData();
    } catch (err: any) {
      console.error("Reject error:", err);
      if (err?.message?.includes("User rejected")) {
        toast("error", "Cancelled", "You rejected the transaction");
      } else {
        toast("error", "Failed to reject", err?.message?.slice(0, 80) || "Please try again");
      }
    }
    setRejectingKey(null);
  };

  // Helper: get status of a search result
  const getRequestStatus = (ownerAddr: string): "none" | "sent" | "incoming" | "friend" => {
    if (friends.some((f) => f.toBase58() === ownerAddr)) return "friend";
    if (outgoingRequests.some((r) => r.to === ownerAddr)) return "sent";
    if (incomingRequests.some((r) => r.from === ownerAddr)) return "incoming";
    return "none";
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] rounded-2xl p-8 text-center border border-[#E2E8F0]">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-[#2563EB]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Find Friends</h3>
          <p className="text-sm text-[#64748B] max-w-sm mx-auto">Connect your wallet to search for friends by username and send friend requests on-chain.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-1 bg-[#F1F5F9] rounded-xl p-1">
        {[
          { id: "search" as const, label: "Search", icon: Search, count: 0 },
          { id: "incoming" as const, label: "Incoming", icon: UserPlus, count: incomingRequests.length },
          { id: "outgoing" as const, label: "Sent", icon: Clock, count: outgoingRequests.length },
          { id: "list" as const, label: "Friends", icon: Users, count: friends.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === tab.id
                ? "bg-white text-[#2563EB] shadow-sm"
                : "text-[#64748B] hover:text-[#1A1A2E]"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                activeSection === tab.id ? "bg-[#2563EB] text-white" : "bg-[#E2E8F0] text-[#64748B]"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search Section */}
      {activeSection === "search" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username or display name..."
                  className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                />
              </div>
            </div>

            {searching && (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB] mr-2" />
                <span className="text-sm text-[#64748B]">Searching on-chain profiles...</span>
              </div>
            )}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-[#94A3B8]">No users found for &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map((result) => {
                  const status = getRequestStatus(result.owner);
                  return (
                    <div key={result.owner} className="flex items-center gap-3 p-3 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-lg border-2 border-white shadow-sm flex-shrink-0">
                        👤
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#1A1A2E] text-sm truncate">{result.displayName || result.username}</span>
                        </div>
                        <span className="text-xs text-[#94A3B8]">@{result.username}</span>
                      </div>
                      <div className="flex-shrink-0">
                        {status === "friend" && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#16A34A] bg-[#F0FDF4] px-3 py-1.5 rounded-lg">
                            <UserCheck className="w-3.5 h-3.5" /> Friends
                          </span>
                        )}
                        {status === "sent" && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#F59E0B] bg-[#FFFBEB] px-3 py-1.5 rounded-lg">
                            <Clock className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                        {status === "incoming" && (
                          <button
                            onClick={() => handleAccept(result.owner)}
                            disabled={!!acceptingFrom}
                            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#16A34A] hover:bg-[#15803d] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Accept
                          </button>
                        )}
                        {status === "none" && (
                          <button
                            onClick={() => handleSendRequest(result.owner)}
                            disabled={sendingTo === result.owner}
                            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {sendingTo === result.owner ? (
                              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                            ) : (
                              <><UserPlus className="w-3.5 h-3.5" /> Add Friend</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {searchQuery.length < 2 && !searching && (
            <div className="bg-[#F8FAFC] rounded-xl p-6 text-center border border-[#E2E8F0]">
              <Search className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm text-[#94A3B8]">Search for users by their username or display name</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Type at least 2 characters to start searching</p>
            </div>
          )}
        </div>
      )}

      {/* Incoming Requests */}
      {activeSection === "incoming" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Incoming Friend Requests</h3>
            <button
              onClick={fetchFriendData}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {incomingRequests.length === 0 ? (
            <div className="bg-[#F8FAFC] rounded-xl p-6 text-center border border-[#E2E8F0]">
              <UserPlus className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm text-[#94A3B8]">No incoming friend requests</p>
              <p className="text-xs text-[#CBD5E1] mt-1">When someone sends you a request, it&apos;ll show up here</p>
            </div>
          ) : (
            incomingRequests.map((req) => {
              const profile = profileMap[req.from];
              const name = profile?.displayName || req.from.slice(0, 4) + "..." + req.from.slice(-4);
              const username = profile?.username || req.from.slice(0, 8);
              return (
                <div key={req.publicKey} className="bg-white rounded-2xl border border-[#E2E8F0] p-4 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] flex items-center justify-center text-lg border-2 border-white shadow-sm flex-shrink-0">
                      🤝
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#1A1A2E] text-sm truncate">{name}</span>
                        <span className="text-xs text-[#94A3B8]">@{username}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-[#94A3B8]">
                          {Number(req.createdAt) > 0 ? timeAgo(Number(req.createdAt) * 1000) : "recently"}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded-full">
                          <Globe className="w-2 h-2" /> on-chain
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAccept(req.from)}
                        disabled={acceptingFrom === req.from}
                        className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#16A34A] hover:bg-[#15803d] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {acceptingFrom === req.from ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(req.from, req.to)}
                        disabled={rejectingKey === req.from}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#EF4444] bg-[#FEF2F2] hover:bg-[#FEE2E2] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {rejectingKey === req.from ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Outgoing Requests */}
      {activeSection === "outgoing" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Sent Friend Requests</h3>
            <button
              onClick={fetchFriendData}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {outgoingRequests.length === 0 ? (
            <div className="bg-[#F8FAFC] rounded-xl p-6 text-center border border-[#E2E8F0]">
              <Clock className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm text-[#94A3B8]">No pending sent requests</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Search for a username to send a friend request</p>
            </div>
          ) : (
            outgoingRequests.map((req) => {
              const profile = profileMap[req.to];
              const name = profile?.displayName || req.to.slice(0, 4) + "..." + req.to.slice(-4);
              const username = profile?.username || req.to.slice(0, 8);
              return (
                <div key={req.publicKey} className="bg-white rounded-2xl border border-[#E2E8F0] p-4 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#EFF6FF] to-[#E0F2FE] flex items-center justify-center text-lg border-2 border-white shadow-sm flex-shrink-0">
                      ⏳
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#1A1A2E] text-sm truncate">{name}</span>
                        <span className="text-xs text-[#94A3B8]">@{username}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-[#F59E0B]">Awaiting response</span>
                        <span className="text-xs text-[#94A3B8]">
                          {Number(req.createdAt) > 0 ? timeAgo(Number(req.createdAt) * 1000) : "recently"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleReject(req.from, req.to)}
                      disabled={rejectingKey === req.from}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#94A3B8] hover:text-[#EF4444] bg-[#F1F5F9] hover:bg-[#FEF2F2] px-3 py-2 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {rejectingKey === req.from ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Friend List */}
      {activeSection === "list" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Your Friends</h3>
            <span className="text-xs text-[#94A3B8]">{friends.length} friends</span>
          </div>

          {friends.length === 0 ? (
            <div className="bg-[#F8FAFC] rounded-xl p-6 text-center border border-[#E2E8F0]">
              <Users className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm text-[#94A3B8]">No friends yet</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Search for someone by username to add them!</p>
            </div>
          ) : (
            friends.map((friend) => {
              const addr = friend.toBase58();
              const profile = profileMap[addr];
              const name = profile?.displayName || addr.slice(0, 4) + "..." + addr.slice(-4);
              const username = profile?.username || addr.slice(0, 8);
              return (
                <div key={addr} className="bg-white rounded-2xl border border-[#E2E8F0] p-4 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] flex items-center justify-center text-lg border-2 border-white shadow-sm flex-shrink-0">
                      ✅
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#1A1A2E] text-sm truncate">{name}</span>
                        <span className="text-xs text-[#94A3B8]">@{username}</span>
                      </div>
                      <span className="text-xs text-[#16A34A]">Friends</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#16A34A] bg-[#F0FDF4] px-2.5 py-1.5 rounded-lg flex-shrink-0">
                      <UserCheck className="w-3.5 h-3.5" /> Connected
                    </span>
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
