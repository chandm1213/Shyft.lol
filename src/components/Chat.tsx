"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, ArrowLeft, DollarSign, Lock, Shield, Search, RefreshCw, Plus, MessageCircle, Zap } from "lucide-react";
import { useProgram } from "@/hooks/useProgram";
import { usePrivatePayment } from "@/hooks/usePrivatePayment";
import { toast } from "@/components/Toast";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface ContactInfo {
  pubkey: PublicKey;
  address: string;
  displayName: string;
  username: string;
  avatar: string;
  isMutual: boolean;
}

interface ChatInfo {
  friendAddress: string;
  friend: ContactInfo;
  hasConversation: boolean;
  lastMessage: string;
  lastMessageTime: number;
}

interface EphemeralMsg {
  sender: string;
  body: string;
  timestamp: number;
}

export default function Chat() {
  const program = useProgram();
  const { publicKey, connected } = useWallet();
  const { sendPayment } = usePrivatePayment();

  // State
  const [friends, setFriends] = useState<ContactInfo[]>([]);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [activeChat, setActiveChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<EphemeralMsg[]>([]);
  const [messageText, setMessageText] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [setting_up, setSettingUp] = useState(false);
  const [profileDelegated, setProfileDelegated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const subIdRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check if profile is delegated
  useEffect(() => {
    if (!program || !publicKey) return;
    program.isProfileDelegated().then(setProfileDelegated).catch(() => {});
  }, [program, publicKey]);

  // Load contacts (people you follow / mutual follows)
  const loadFriendsAndChats = useCallback(async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    try {
      const [followingList, followersList, profiles] = await Promise.all([
        program.getFollowing(publicKey),
        program.getFollowers(publicKey),
        program.getAllProfiles(),
      ]);

      const profileMap: Record<string, any> = {};
      profiles.forEach((p: any) => { profileMap[p.owner] = p; });

      // Build contact list from people you follow
      const contactInfos: ContactInfo[] = followingList.map((addr: string) => {
        const profile = profileMap[addr];
        const isMutual = followersList.includes(addr);
        return {
          pubkey: new PublicKey(addr),
          address: addr,
          displayName: profile?.displayName || profile?.display_name || addr.slice(0, 4) + "..." + addr.slice(-4),
          username: profile?.username || addr.slice(0, 8),
          avatar: isMutual ? "👥" : "👤",
          isMutual,
        };
      });
      setFriends(contactInfos);

      const chatInfos: ChatInfo[] = [];
      for (const friend of contactInfos) {
        const hasConv = await program.conversationExists(publicKey, friend.pubkey);
        let lastMsg = "";
        let lastTime = 0;
        if (hasConv) {
          try {
            const msgs = await program.getConversationMessages(publicKey, friend.pubkey);
            if (msgs.length > 0) {
              const last = msgs[msgs.length - 1];
              lastMsg = last.body.slice(0, 40);
              lastTime = last.timestamp * 1000;
            } else {
              lastMsg = "Conversation ready";
            }
          } catch { lastMsg = "Conversation active"; }
        }
        chatInfos.push({
          friendAddress: friend.address,
          friend,
          hasConversation: hasConv,
          lastMessage: hasConv ? (lastMsg || "Start chatting...") : "Tap to start ephemeral chat",
          lastMessageTime: lastTime,
        });
      }

      chatInfos.sort((a, b) => {
        if (a.hasConversation && !b.hasConversation) return -1;
        if (!a.hasConversation && b.hasConversation) return 1;
        return b.lastMessageTime - a.lastMessageTime;
      });
      setChats(chatInfos);
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
    setLoading(false);
  }, [program, publicKey]);

  useEffect(() => {
    loadFriendsAndChats();
  }, [loadFriendsAndChats]);

  // Load messages + subscribe to real-time updates
  const loadMessages = useCallback(async (chatInfo: ChatInfo) => {
    if (!program || !publicKey) return;
    setLoadingMessages(true);
    try {
      const msgs = await program.getConversationMessages(publicKey, chatInfo.friend.pubkey);
      setMessages(msgs);
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
    }
    setLoadingMessages(false);
  }, [program, publicKey]);

  // Subscribe to real-time updates when chat opens
  useEffect(() => {
    if (!activeChat || !program || !publicKey || !activeChat.hasConversation) return;

    // Subscribe to ER account changes for real-time messages
    const subId = program.onConversationChange(
      publicKey,
      activeChat.friend.pubkey,
      (msgs) => {
        setMessages(msgs);
      }
    );
    // Also try reverse ordering
    const subId2 = program.onConversationChange(
      activeChat.friend.pubkey,
      publicKey,
      (msgs) => {
        setMessages(msgs);
      }
    );
    subIdRef.current = subId;

    return () => {
      if (subId !== null) program.removeConversationListener(subId);
      if (subId2 !== null) program.removeConversationListener(subId2);
    };
  }, [activeChat, program, publicKey]);

  const selectChat = async (chat: ChatInfo) => {
    setActiveChat(chat);
    setMessages([]);
    if (chat.hasConversation) {
      loadMessages(chat);
    }
  };

  /** Set up ephemeral chat: delegate profile → create conversations for ALL mutual follows → undelegate.
   *  This way the user only pays the delegation cost ONCE, not per-contact. */
  const setupEphemeralChat = async (friend: ContactInfo): Promise<boolean> => {
    if (!program || !publicKey) return false;
    setSettingUp(true);
    try {
      // Step 1: Top up & delegate profile in a SINGLE transaction (1 wallet prompt)
      const isDelegated = await program.isProfileDelegated();
      if (!isDelegated) {
        toast("privacy", "Setting up ephemeral chat", "Funding & delegating profile to MagicBlock...");
        await program.topUpAndDelegateProfile(2_000_000); // 0.002 SOL minimum
        setProfileDelegated(true);
        console.log("✅ Profile topped up & delegated (single TX)");
      }

      // Step 2: Wait for the ER to pick up the delegated profile
      toast("privacy", "Waiting for MagicBlock ER sync", "Confirming delegation...");
      await program.waitForProfileOnER(8000);
      console.log("✅ Profile confirmed on ER");

      // Step 3: Create conversations for ALL mutual follows who don't have one yet
      // This way we only delegate/undelegate ONCE, not per-contact
      const friendsNeedingConv: ContactInfo[] = [];
      for (const f of friends) {
        if (!f.isMutual) continue; // only mutual follows
        const hasUsable = await program.conversationExists(publicKey, f.pubkey);
        if (!hasUsable) {
          // Check for stale conversations to clean up first
          const stalePda = await program.findStaleConversation(publicKey, f.pubkey);
          if (stalePda) {
            console.log(`🗑️ Closing stale conversation with ${f.address.slice(0, 8)}...`);
            try {
              await program.closeConversation(f.pubkey);
              await new Promise(r => setTimeout(r, 2000));
            } catch (closeErr: any) {
              console.warn("Close stale conv failed:", closeErr?.message?.slice(0, 80));
            }
          }
          friendsNeedingConv.push(f);
        }
      }

      // Make sure the target contact is in the list
      if (!friendsNeedingConv.some(f => f.pubkey.equals(friend.pubkey))) {
        const hasUsable = await program.conversationExists(publicKey, friend.pubkey);
        if (!hasUsable) {
          friendsNeedingConv.push(friend);
        }
      }

      if (friendsNeedingConv.length === 0) {
        console.log("✅ All conversations already exist — skipping create");
      } else {
        const total = friendsNeedingConv.length;
        console.log(`📨 Creating ${total} conversation(s) in batch...`);
        for (let i = 0; i < friendsNeedingConv.length; i++) {
          const f = friendsNeedingConv[i];
          toast("privacy", `Creating chat ${i + 1}/${total}`, `Setting up chat with ${f.displayName}...`);
          let created = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await program.createConversation(f.pubkey, 10);
              console.log(`✅ Conversation created with ${f.address.slice(0, 8)}... (${i + 1}/${total})`);
              created = true;
              break;
            } catch (err: any) {
              console.warn(`createConversation attempt ${attempt}/3 for ${f.address.slice(0, 8)} failed:`, err?.message?.slice(0, 100));
              if (attempt < 3) {
                await new Promise(r => setTimeout(r, 3000 * attempt));
              }
            }
          }
          if (!created) {
            console.warn(`⚠️ Failed to create conversation with ${f.address.slice(0, 8)} — will retry next time`);
          }
        }
      }

      // Step 4: Undelegate profile so normal operations (posting, etc.) work again
      toast("privacy", "Finalizing setup", "Undelegating profile...");
      try {
        await program.undelegateProfile();
        setProfileDelegated(false);
        console.log("✅ Profile undelegated — normal ops restored");
      } catch (err: any) {
        console.warn("Undelegate after chat setup failed:", err?.message?.slice(0, 80));
      }

      // Refresh chat list to show newly created conversations
      await loadFriendsAndChats();

      toast("success", "Ephemeral chats ready! ⚡", friendsNeedingConv.length > 1
        ? `Set up ${friendsNeedingConv.length} chats — all free messaging from now on`
        : "Messages are free, private & real-time");
      return true;
    } catch (err: any) {
      console.error("Setup failed:", err);
      toast("error", "Ephemeral chat setup failed", err?.message?.slice(0, 80));
      // Try to undelegate even on failure so user isn't stuck
      try { await program.undelegateProfile(); setProfileDelegated(false); } catch {}
      return false;
    } finally {
      setSettingUp(false);
    }
  };

  const handleSend = async () => {
    if (!messageText.trim() || !activeChat || !program || !publicKey) return;
    const content = messageText.trim();
    setMessageText("");
    setSending(true);

    try {
      // If no ephemeral conversation exists yet, set one up
      if (!activeChat.hasConversation) {
        const ok = await setupEphemeralChat(activeChat.friend);
        if (!ok) { setSending(false); return; }
        setActiveChat(prev => prev ? { ...prev, hasConversation: true } : null);
        setChats(prev => prev.map(c =>
          c.friendAddress === activeChat.friendAddress ? { ...c, hasConversation: true } : c
        ));
        // Wait for ER to be ready
        await new Promise(r => setTimeout(r, 1000));
      }

      // Optimistic update
      const localMsg: EphemeralMsg = {
        sender: publicKey.toBase58(),
        body: content,
        timestamp: Math.floor(Date.now() / 1000),
      };
      setMessages(prev => [...prev, localMsg]);

      // Send via ER (FREE!)
      await program.appendMessage(activeChat.friend.pubkey, content);

      // Update chat list
      setChats(prev => prev.map(c =>
        c.friendAddress === activeChat.friendAddress
          ? { ...c, lastMessage: content.slice(0, 40), lastMessageTime: Date.now(), hasConversation: true }
          : c
      ));
    } catch (err: any) {
      console.error("Send error:", err);
      const errMsg = err?.message || err?.toString() || "";

      // If the conversation doesn't exist or is too small, try to set up again
      const isConvMissing = errMsg.includes("AccountNotFound") ||
        errMsg.includes("could not find") ||
        errMsg.includes("Account does not exist") ||
        errMsg.includes("does not exist on ER") ||
        errMsg.includes("too small");

      if (isConvMissing) {
        console.log("⚠️ Conversation missing — attempting to recreate...");
        toast("privacy", "Reconnecting ephemeral chat", "Conversation expired — recreating...");
        try {
          setActiveChat(prev => prev ? { ...prev, hasConversation: false } : null);
          const ok = await setupEphemeralChat(activeChat.friend);
          if (ok) {
            setActiveChat(prev => prev ? { ...prev, hasConversation: true } : null);
            setChats(prev => prev.map(c =>
              c.friendAddress === activeChat.friendAddress ? { ...c, hasConversation: true } : c
            ));
            await new Promise(r => setTimeout(r, 1000));
            await program.appendMessage(activeChat.friend.pubkey, content);
            setChats(prev => prev.map(c =>
              c.friendAddress === activeChat.friendAddress
                ? { ...c, lastMessage: content.slice(0, 40), lastMessageTime: Date.now(), hasConversation: true }
                : c
            ));
            toast("success", "Message sent! ⚡", "Ephemeral chat reconnected");
          } else {
            toast("error", "Failed to send message", "Could not reconnect ephemeral chat");
          }
        } catch (retryErr: any) {
          console.error("Retry after recreate failed:", retryErr);
          toast("error", "Failed to send message", retryErr?.message?.slice(0, 80));
        }
      } else {
        toast("error", "Failed to send message", errMsg.slice(0, 80));
      }
    }
    setSending(false);
  };

  const handleSendPayment = async () => {
    if (!paymentAmount || !activeChat || !program || !publicKey) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast("error", "Invalid amount", "Enter a valid SOL amount");
      return;
    }
    setPaymentAmount("");
    setShowPayment(false);
    setSending(true);

    toast("privacy", "Sending payment", `Transferring ${amount} SOL to ${activeChat.friend.displayName}`);

    try {
      const result = await sendPayment(activeChat.friend.address, amount);
      if (!result) throw new Error("Payment transaction failed");
      console.log("✅ SOL payment confirmed:", result.transferSig);

      // Record payment as ephemeral message (free)
      const paymentMsg = `💸 Sent ${amount} SOL`;
      if (activeChat.hasConversation) {
        try {
          await program.appendMessage(activeChat.friend.pubkey, paymentMsg);
        } catch { /* best effort */ }
      }

      toast("success", "Payment sent! 💸", `${amount} SOL → ${activeChat.friend.displayName}`);

      setChats(prev => prev.map(c =>
        c.friendAddress === activeChat.friendAddress
          ? { ...c, lastMessage: paymentMsg, lastMessageTime: Date.now() }
          : c
      ));
    } catch (err: any) {
      console.error("Payment error:", err);
      toast("error", "Payment failed", err?.message?.slice(0, 80));
    }
    setSending(false);
  };

  const filteredChats = chats.filter(c =>
    c.friend.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.friend.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-[#7C3AED]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Ephemeral Messaging</h3>
          <p className="text-sm text-[#64748B]">Connect your wallet to access free, private, real-time chats</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] sm:h-[calc(100vh-73px)] md:h-[calc(100vh-73px)] max-w-5xl mx-auto bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
      {/* Conversation List */}
      <div
        className={`w-full md:w-80 border-r border-[#E2E8F0] flex flex-col ${
          activeChat ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="p-3 sm:p-4 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-sm text-[#1A1A2E]">Chats</h2>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#7C3AED]/10 text-[#7C3AED] font-medium">⚡ Ephemeral</span>
            </div>
            <button
              onClick={loadFriendsAndChats}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search friends..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && chats.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-[#94A3B8] animate-spin" />
            </div>
          )}

          {!loading && filteredChats.length === 0 && (
            <div className="p-6 text-center">
              <MessageCircle className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8] mb-1">No chats yet</p>
              <p className="text-xs text-[#94A3B8]">Follow people in the People tab to start chatting</p>
            </div>
          )}

          {filteredChats.map((chat) => (
            <button
              key={chat.friendAddress}
              onClick={() => selectChat(chat)}
              className={`touch-active w-full flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 hover:bg-[#F8FAFC] active:bg-[#F1F5F9] transition-colors border-b border-[#F1F5F9] ${
                activeChat?.friendAddress === chat.friendAddress ? "bg-[#EFF6FF]" : ""
              }`}
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-xl">
                  {chat.friend.avatar}
                </div>
                {chat.hasConversation ? (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#7C3AED] border-2 border-white flex items-center justify-center">
                    <Zap className="w-2 h-2 text-white" />
                  </div>
                ) : (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#94A3B8] border-2 border-white" />
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[#1A1A2E] truncate">{chat.friend.displayName}</span>
                  <span className="text-[10px] text-[#94A3B8] flex-shrink-0">
                    {chat.lastMessageTime > 0 ? timeAgo(chat.lastMessageTime) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {chat.hasConversation ? (
                    <Zap className="w-2.5 h-2.5 text-[#7C3AED] flex-shrink-0" />
                  ) : (
                    <Plus className="w-2.5 h-2.5 text-[#94A3B8] flex-shrink-0" />
                  )}
                  <p className="text-xs text-[#64748B] truncate">{chat.lastMessage}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col ${activeChat ? "flex" : "hidden md:flex"}`}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#E2E8F0] bg-white">
              <button
                onClick={() => { setActiveChat(null); setMessages([]); }}
                className="md:hidden w-9 h-9 rounded-lg hover:bg-[#F1F5F9] active:bg-[#E2E8F0] flex items-center justify-center flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-base sm:text-lg flex-shrink-0">
                {activeChat.friend.avatar}
              </div>
              <div className="flex-1">
                <span className="font-semibold text-sm text-[#1A1A2E]">
                  {activeChat.friend.displayName}
                </span>
                <div className="flex items-center gap-1">
                  {activeChat.hasConversation ? (
                    <>
                      <Zap className="w-2.5 h-2.5 text-[#7C3AED]" />
                      <span className="text-[10px] text-[#7C3AED] font-medium">Ephemeral • Free • Private • Real-time</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-2.5 h-2.5 text-[#94A3B8]" />
                      <span className="text-[10px] text-[#94A3B8] font-medium">Send a message to start ephemeral chat</span>
                    </>
                  )}
                </div>
              </div>
              {activeChat.hasConversation && (
                <button
                  onClick={() => loadMessages(activeChat)}
                  disabled={loadingMessages}
                  className="w-8 h-8 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-center"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#94A3B8] ${loadingMessages ? "animate-spin" : ""}`} />
                </button>
              )}
              <button
                onClick={() => setShowPayment(!showPayment)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  showPayment ? "bg-[#16A34A] text-white" : "bg-[#F0FDF4] text-[#16A34A] hover:bg-[#DCFCE7]"
                }`}
              >
                <DollarSign className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFBFC]">
              <div className="flex justify-center mb-4">
                <span className="text-[10px] text-[#94A3B8] bg-white px-3 py-1 rounded-full border border-[#E2E8F0] flex items-center gap-1">
                  {activeChat.hasConversation ? (
                    <>
                      <Zap className="w-2.5 h-2.5 text-[#7C3AED]" /> Ephemeral messages via MagicBlock — free & private
                    </>
                  ) : (
                    <>
                      <Shield className="w-2.5 h-2.5" /> First message will create an ephemeral channel
                    </>
                  )}
                </span>
              </div>

              {setting_up && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <RefreshCw className="w-6 h-6 text-[#7C3AED] animate-spin mx-auto mb-2" />
                    <p className="text-sm text-[#7C3AED] font-medium">Setting up ephemeral channel...</p>
                    <p className="text-xs text-[#94A3B8] mt-1">Delegating profile + creating conversation</p>
                  </div>
                </div>
              )}

              {loadingMessages && messages.length === 0 && !setting_up && (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-[#94A3B8] animate-spin" />
                </div>
              )}

              {!loadingMessages && messages.length === 0 && activeChat.hasConversation && !setting_up && (
                <div className="text-center py-8">
                  <p className="text-sm text-[#94A3B8]">No messages yet. Say hello! 👋</p>
                </div>
              )}

              {!activeChat.hasConversation && messages.length === 0 && !setting_up && (
                <div className="text-center py-8">
                  <Zap className="w-10 h-10 text-[#7C3AED] mx-auto mb-3" />
                  <p className="text-sm text-[#64748B] mb-1">Ephemeral messaging powered by MagicBlock</p>
                  <p className="text-xs text-[#94A3B8]">Messages are free, private & real-time ⚡</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Send your first message to create the channel</p>
                </div>
              )}

              {messages.map((msg, i) => {
                const isMe = publicKey && msg.sender === publicKey.toBase58();
                const isPaymentMsg = msg.body.startsWith("💸");

                if (isPaymentMsg) {
                  return (
                    <div key={`${msg.timestamp}-${i}`} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[280px] rounded-2xl p-3 sm:p-4 ${
                        isMe
                          ? "bg-gradient-to-br from-[#16A34A] to-[#15803D] text-white"
                          : "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] text-[#15803D]"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-xs font-medium">{isMe ? "You sent" : "Received"}</span>
                        </div>
                        <p className="text-lg font-bold">{msg.body.replace("💸 ", "")}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Zap className="w-3 h-3" />
                          <span className="text-[10px] opacity-80">Private Payment</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`${msg.timestamp}-${i}`} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[320px] px-3.5 sm:px-4 py-2.5 rounded-2xl text-sm ${
                        isMe
                          ? "bg-[#2563EB] text-white rounded-br-md"
                          : "bg-white text-[#1A1A2E] border border-[#E2E8F0] rounded-bl-md"
                      }`}
                    >
                      <p>{msg.body}</p>
                      <div className={`flex items-center gap-1 mt-1 ${isMe ? "text-blue-200" : "text-[#94A3B8]"}`}>
                        <span className="text-[10px]">
                          {msg.timestamp > 0 ? timeAgo(msg.timestamp * 1000) : "now"}
                        </span>
                        <Zap className="w-2 h-2 text-[#7C3AED]" />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Payment Bar */}
            {showPayment && (
              <div className="px-4 py-3 bg-[#F0FDF4] border-t border-[#DCFCE7] animate-fade-in">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-white rounded-xl border border-[#DCFCE7] px-3 py-2">
                    <DollarSign className="w-4 h-4 text-[#16A34A]" />
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Amount"
                      className="flex-1 text-sm focus:outline-none bg-transparent"
                    />
                    <span className="text-xs font-medium text-[#64748B]">SOL</span>
                  </div>
                  <button
                    onClick={handleSendPayment}
                    disabled={!paymentAmount}
                    className="px-4 py-2.5 bg-[#16A34A] text-white text-sm font-medium rounded-xl hover:bg-[#15803D] disabled:opacity-40 transition-all"
                  >
                    Send
                  </button>
                </div>
                <p className="text-[10px] text-[#16A34A] mt-1.5 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> SOL transfer on-chain + message recorded in ephemeral channel
                </p>
              </div>
            )}

            {/* Message Input */}
            <div className="p-2.5 sm:p-3 border-t border-[#E2E8F0] bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder={setting_up ? "Setting up ephemeral channel..." : "Type a message — free & private ⚡"}
                  disabled={sending || setting_up}
                  className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 sm:px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending || setting_up}
                  className="touch-active w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center hover:bg-[#1D4ED8] disabled:opacity-40 transition-all flex-shrink-0"
                >
                  {sending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED]/10 to-[#2563EB]/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-[#7C3AED]" />
              </div>
              <h3 className="font-bold text-[#1A1A2E] mb-1">
                {chats.length > 0 ? "Select a conversation" : "No contacts yet"}
              </h3>
              <p className="text-sm text-[#64748B]">
                {chats.length > 0
                  ? "Ephemeral messaging — free, private & real-time ⚡"
                  : "Follow people to start chatting"}
              </p>
              {profileDelegated && (
                <p className="text-[10px] text-[#7C3AED] mt-2 flex items-center gap-1 justify-center">
                  <Zap className="w-2.5 h-2.5" /> Profile delegated to MagicBlock ER
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
