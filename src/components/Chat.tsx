"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  ArrowLeft,
  DollarSign,
  Lock,
  Shield,
  Search,
  RefreshCw,
  Plus,
  MessageCircle,
  ShieldCheck,
  KeyRound,
  AlertCircle,
} from "lucide-react";
import { useProgram } from "@/hooks/useProgram";
import { usePrivatePayment } from "@/hooks/usePrivatePayment";
import { toast } from "@/components/Toast";
import { useWallet } from "@/hooks/usePrivyWallet";
import { PublicKey } from "@solana/web3.js";
import { deriveEncryptionKeypair } from "@/lib/encryption";
import { deriveChatId } from "@/lib/program";
import nacl from "tweetnacl";

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
  chatId: number;
  friendAddress: string;
  friend: ContactInfo;
  exists: boolean;
  messageCount: number;
  lastMessage: string;
  lastMessageTime: number;
}

interface DecryptedMsg {
  publicKey: string;
  messageIndex: number;
  sender: string;
  content: string;
  decrypted: string | null;
  isPayment: boolean;
  paymentAmount: number;
  timestamp: string;
  isKeyExchange: boolean;
  isEncrypted: boolean;
  isMe: boolean;
}

export default function Chat() {
  const program = useProgram();
  const { publicKey, connected } = useWallet();
  const wallet = useWallet();
  const { sendPayment } = usePrivatePayment();

  // Encryption state
  const [encryptionKeys, setEncryptionKeys] = useState<nacl.BoxKeyPair | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);

  // State
  const [friends, setFriends] = useState<ContactInfo[]>([]);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [activeChat, setActiveChat] = useState<ChatInfo | null>(null);
  const [peerPubKey, setPeerPubKey] = useState<Uint8Array | null>(null);
  const [messages, setMessages] = useState<DecryptedMsg[]>([]);
  const [messageText, setMessageText] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const publishingChatsRef = useRef(new Set<number>());
  const keyPublishedChats = useRef(new Set<number>());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Derive encryption keys from wallet on mount
  useEffect(() => {
    if (!publicKey || !wallet.wallet || encryptionKeys) return;

    const deriveKeys = async () => {
      setKeysLoading(true);
      try {
        const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
          const result = await wallet.wallet!.signMessage({ message });
          return new Uint8Array(result.signature);
        };
        const keys = await deriveEncryptionKeypair(publicKey.toBase58(), signMessage);
        setEncryptionKeys(keys);
        console.log("🔑 E2E encryption keys derived");
      } catch (err: any) {
        console.error("Failed to derive encryption keys:", err);
        toast("error", "Encryption key error", "Could not derive encryption keys. Try reconnecting.");
      }
      setKeysLoading(false);
    };
    deriveKeys();
  }, [publicKey, wallet.wallet, encryptionKeys]);

  // Load contacts and chat list
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

      const contactInfos: ContactInfo[] = followingList.map((addr: string) => {
        const profile = profileMap[addr];
        const isMutual = followersList.includes(addr);
        return {
          pubkey: new PublicKey(addr),
          address: addr,
          displayName: profile?.displayName || profile?.display_name || addr.slice(0, 4) + "..." + addr.slice(-4),
          username: profile?.username || addr.slice(0, 8),
          avatar: profile?.avatarUrl || (isMutual ? "👥" : "👤"),
          isMutual,
        };
      });
      setFriends(contactInfos);

      const chatInfos: ChatInfo[] = [];
      for (const friend of contactInfos) {
        const chatId = deriveChatId(publicKey, friend.pubkey);
        const chatData = await program.getChat(chatId);
        const exists = chatData !== null;
        let lastMsg = "";
        let lastTime = 0;
        let msgCount = 0;

        if (exists) {
          msgCount = Number(chatData.messageCount || 0);
          if (msgCount > 0) {
            try {
              const msgs = await program.getMessagesForChat(chatId);
              const visibleMsgs = msgs.filter((m: any) => !m.content.startsWith("PUBKEY:"));
              if (visibleMsgs.length > 0) {
                const last = visibleMsgs[visibleMsgs.length - 1];
                if (last.content.startsWith("ENC:")) {
                  lastMsg = "🔒 Encrypted message";
                } else {
                  lastMsg = last.content.slice(0, 40);
                }
                lastTime = Number(last.timestamp || "0") * 1000;
              } else {
                lastMsg = "🔑 Key exchange complete";
              }
            } catch {
              lastMsg = "Chat active";
            }
          }
        }

        chatInfos.push({
          chatId,
          friendAddress: friend.address,
          friend,
          exists,
          messageCount: msgCount,
          lastMessage: exists ? (lastMsg || "Start chatting...") : "Tap to start encrypted chat",
          lastMessageTime: lastTime,
        });
      }

      chatInfos.sort((a, b) => {
        if (a.exists && !b.exists) return -1;
        if (!a.exists && b.exists) return 1;
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

  // Load messages for active chat
  const loadMessages = useCallback(async (chatInfo: ChatInfo) => {
    if (!program || !publicKey || !encryptionKeys) return;
    setLoadingMessages(true);
    try {
      // Invalidate message caches so we get fresh on-chain data
      const { clearRpcCache } = await import("@/lib/program");
      clearRpcCache();

      const myAddr = publicKey.toBase58();

      // First: ensure WE have published our key (critical for second user)
      // Use a ref lock to prevent concurrent calls from publishing multiple times
      if (chatInfo.exists && !publishingChatsRef.current.has(chatInfo.chatId) && !keyPublishedChats.current.has(chatInfo.chatId)) {
        try {
          const hasMyKey = await program.findMyEncryptionKey(chatInfo.chatId, myAddr);
          if (!hasMyKey) {
            publishingChatsRef.current.add(chatInfo.chatId);
            console.log("🔑 Publishing our encryption key for this chat...");
            const msgIndex = await program.getNextMessageIndex(chatInfo.chatId);
            await program.publishEncryptionKey(chatInfo.chatId, msgIndex, encryptionKeys.publicKey);
            console.log("✅ Encryption key published on-chain!");
            keyPublishedChats.current.add(chatInfo.chatId);
            publishingChatsRef.current.delete(chatInfo.chatId);
          } else {
            // Already on-chain, mark so we don't check again
            keyPublishedChats.current.add(chatInfo.chatId);
          }
        } catch (keyErr) {
          publishingChatsRef.current.delete(chatInfo.chatId);
          console.warn("Key publish check failed:", keyErr);
        }
      }

      // Now check for peer's key (uses direct PDA lookups, no cache)
      const peerKey = await program.findPeerEncryptionKey(chatInfo.chatId, myAddr);
      setPeerPubKey(peerKey);

      if (peerKey) {
        const decrypted = await program.getDecryptedMessages(
          chatInfo.chatId,
          myAddr,
          encryptionKeys.secretKey,
          peerKey
        );
        setMessages(decrypted);
      } else {
        const raw = await program.getMessagesForChat(chatInfo.chatId);
        setMessages(raw.map((m: any) => ({
          publicKey: m.publicKey,
          messageIndex: m.messageIndex,
          sender: m.sender,
          content: m.content,
          decrypted: m.content.startsWith("PLAIN:") ? m.content.slice(6) : null,
          isPayment: m.isPayment,
          paymentAmount: m.paymentAmount,
          timestamp: m.timestamp,
          isKeyExchange: m.content.startsWith("PUBKEY:"),
          isEncrypted: m.content.startsWith("ENC:") || m.content.startsWith("PLAIN:"),
          isMe: m.sender === myAddr,
        })));
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
    }
    setLoadingMessages(false);
  }, [program, publicKey, encryptionKeys]);

  // Poll for new messages
  useEffect(() => {
    if (!activeChat) return;
    // For non-existent chats, nothing to poll
    if (!activeChat.exists) return;

    // Load immediately
    loadMessages(activeChat);

    // Poll, but skip if previous call is still running
    const loadingRef = { current: false };
    pollRef.current = setInterval(async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      await loadMessages(activeChat);
      loadingRef.current = false;
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeChat?.chatId, activeChat?.exists, loadMessages]);

  const selectChat = async (chat: ChatInfo) => {
    setActiveChat(chat);
    setMessages([]);
    setPeerPubKey(null);
    // Don't call loadMessages here — the useEffect watches activeChat and will call it
  };

  const handleSend = async () => {
    if (!messageText.trim() || !program || !publicKey || !encryptionKeys) return;
    const content = messageText.trim();
    setMessageText("");
    setSending(true);

    try {
      let chatInfo = activeChat;

      if (!chatInfo || !chatInfo.exists) {
        if (!chatInfo) { setSending(false); return; }
        setCreatingChat(true);
        toast("privacy", "Creating encrypted chat", "Setting up E2E encryption on-chain...");

        const { chatId, isNew } = await program.getOrCreateE2EChat(
          chatInfo.friend.pubkey,
          encryptionKeys.publicKey
        );

        chatInfo = { ...chatInfo, chatId, exists: true, messageCount: isNew ? 1 : chatInfo.messageCount };
        setActiveChat(chatInfo);
        setChats(prev => prev.map(c =>
          c.friendAddress === chatInfo!.friendAddress ? chatInfo! : c
        ));
        setCreatingChat(false);
        toast("success", "Chat created! 🔐", "E2E encrypted channel established on-chain");

        const myAddr = publicKey.toBase58();
        const peerKey = await program.findPeerEncryptionKey(chatInfo.chatId, myAddr);
        setPeerPubKey(peerKey);

      }

      // ===== Ensure our encryption key is published (critical for 2nd participant) =====
      // loadMessages does this too, but there's a race condition if user sends before it completes
      if (chatInfo.exists && !keyPublishedChats.current.has(chatInfo.chatId)) {
        try {
          const myAddr = publicKey.toBase58();
          const hasMyKey = await program.findMyEncryptionKey(chatInfo.chatId, myAddr);
          if (!hasMyKey) {
            console.log("🔑 handleSend: Publishing our encryption key before sending...");
            const keyMsgIndex = await program.getNextMessageIndex(chatInfo.chatId);
            await program.publishEncryptionKey(chatInfo.chatId, keyMsgIndex, encryptionKeys.publicKey);
            console.log("✅ handleSend: Encryption key published!");
            keyPublishedChats.current.add(chatInfo.chatId);
          } else {
            keyPublishedChats.current.add(chatInfo.chatId);
          }
        } catch (keyErr) {
          console.warn("handleSend: Key publish failed:", keyErr);
        }
      }

      // Always do a fresh peer key lookup for THIS specific chat
      // (peerPubKey state may be stale from a previously selected chat)
      const myAddr2 = publicKey.toBase58();
      let peerKey = await program.findPeerEncryptionKey(chatInfo.chatId, myAddr2);
      setPeerPubKey(peerKey);

      const msgIndex = await program.getNextMessageIndex(chatInfo.chatId);

      const localMsg: DecryptedMsg = {
        publicKey: "pending",
        messageIndex: msgIndex,
        sender: publicKey.toBase58(),
        content: peerKey ? "ENC:..." : "PLAIN:" + content,
        decrypted: content,
        isPayment: false,
        paymentAmount: 0,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        isKeyExchange: false,
        isEncrypted: true,
        isMe: true,
      };
      setMessages(prev => [...prev, localMsg]);

      if (peerKey) {
        // E2E encrypted send
        await program.sendE2EMessage(
          chatInfo.chatId,
          msgIndex,
          content,
          encryptionKeys.secretKey,
          peerKey
        );
      } else {
        // No peer key yet — send as plaintext (on-chain but readable)
        // This ensures the message lands immediately without waiting for key exchange
        await program.sendMessageSimple(
          chatInfo.chatId,
          msgIndex,
          "PLAIN:" + content
        );
        toast("privacy", "Sent (pre-encryption)", "Future messages will be E2E encrypted after key exchange.");
      }

      setChats(prev => prev.map(c =>
        c.friendAddress === chatInfo!.friendAddress
          ? { ...c, lastMessage: "🔒 Encrypted message", lastMessageTime: Date.now(), exists: true, messageCount: msgIndex + 1 }
          : c
      ));
    } catch (err: any) {
      console.error("Send error:", err);
      toast("error", "Failed to send", err?.message?.slice(0, 80) || "Transaction failed");
      setMessages(prev => prev.filter(m => m.publicKey !== "pending"));
    }
    setSending(false);
  };

  const handleSendPayment = async () => {
    if (!paymentAmount || !activeChat || !program || !publicKey || !encryptionKeys) return;
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

      if (activeChat.exists && peerPubKey) {
        try {
          const chatData = await program.getChat(activeChat.chatId);
          const msgIndex = chatData ? Number(chatData.messageCount || 0) : 0;
          await program.sendE2EMessage(
            activeChat.chatId,
            msgIndex,
            `💸 Sent ${amount} SOL`,
            encryptionKeys.secretKey,
            peerPubKey,
            true,
            Math.round(amount * 1_000_000)
          );
        } catch { /* best effort */ }
      }

      toast("success", "Payment sent! 💸", `${amount} SOL → ${activeChat.friend.displayName}`);
      setChats(prev => prev.map(c =>
        c.friendAddress === activeChat.friendAddress
          ? { ...c, lastMessage: `💸 Sent ${amount} SOL`, lastMessageTime: Date.now() }
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
            <ShieldCheck className="w-8 h-8 text-[#7C3AED]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">E2E Encrypted Chat</h3>
          <p className="text-sm text-[#64748B]">Connect your wallet to access private, encrypted messaging on Solana</p>
        </div>
      </div>
    );
  }

  if (keysLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <KeyRound className="w-10 h-10 text-[#7C3AED] animate-pulse mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Deriving Encryption Keys</h3>
          <p className="text-sm text-[#64748B]">Sign the message in your wallet to generate your encryption keypair...</p>
        </div>
      </div>
    );
  }

  if (!encryptionKeys) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-[#EF4444] mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Encryption Keys Required</h3>
          <p className="text-sm text-[#64748B] mb-4">Could not derive encryption keys. Please reconnect your wallet.</p>
          <button
            onClick={() => { setEncryptionKeys(null); setKeysLoading(false); }}
            className="px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container flex h-[calc(100vh-120px)] sm:h-[calc(100vh-73px)] md:h-[calc(100vh-73px)] max-w-5xl mx-auto bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
      {/* Conversation List */}
      <div
        className={`w-full md:w-80 border-r border-[#E2E8F0] flex flex-col ${
          activeChat ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="p-3 sm:p-4 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-sm text-[#1A1A2E]">Messages</h2>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#7C3AED]/10 text-[#7C3AED] font-medium">🔐 E2E</span>
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
              placeholder="Search contacts..."
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
              <p className="text-sm text-[#94A3B8] mb-1">No conversations yet</p>
              <p className="text-xs text-[#94A3B8]">Follow people to start encrypted chats</p>
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
                {chat.friend.avatar && chat.friend.avatar.startsWith("http") ? (
                  <img src={chat.friend.avatar} alt={chat.friend.displayName} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-xl">
                    {chat.friend.avatar}
                  </div>
                )}
                {chat.exists ? (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#16A34A] border-2 border-white flex items-center justify-center">
                    <Lock className="w-2 h-2 text-white" />
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
                  {chat.exists ? (
                    <Lock className="w-2.5 h-2.5 text-[#16A34A] flex-shrink-0" />
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
                onClick={() => { setActiveChat(null); setMessages([]); setPeerPubKey(null); }}
                className="md:hidden w-9 h-9 rounded-lg hover:bg-[#F1F5F9] active:bg-[#E2E8F0] flex items-center justify-center flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              {activeChat.friend.avatar && activeChat.friend.avatar.startsWith("http") ? (
                <img src={activeChat.friend.avatar} alt={activeChat.friend.displayName} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-base sm:text-lg flex-shrink-0">
                  {activeChat.friend.avatar}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm text-[#1A1A2E]">
                  {activeChat.friend.displayName}
                </span>
                <div className="flex items-center gap-1">
                  {activeChat.exists && peerPubKey ? (
                    <>
                      <ShieldCheck className="w-2.5 h-2.5 text-[#16A34A]" />
                      <span className="text-[10px] text-[#16A34A] font-medium">E2E Encrypted • On-Chain • NaCl Box</span>
                    </>
                  ) : activeChat.exists ? (
                    <>
                      <KeyRound className="w-2.5 h-2.5 text-[#F59E0B]" />
                      <span className="text-[10px] text-[#F59E0B] font-medium">Waiting for key exchange...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-2.5 h-2.5 text-[#94A3B8]" />
                      <span className="text-[10px] text-[#94A3B8] font-medium">Send a message to start encrypted chat</span>
                    </>
                  )}
                </div>
              </div>
              {activeChat.exists && (
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
                  {activeChat.exists && peerPubKey ? (
                    <>
                      <ShieldCheck className="w-2.5 h-2.5 text-[#16A34A]" /> End-to-end encrypted — NaCl Box on Solana
                    </>
                  ) : activeChat.exists ? (
                    <>
                      <KeyRound className="w-2.5 h-2.5 text-[#F59E0B]" /> Key exchange in progress...
                    </>
                  ) : (
                    <>
                      <Shield className="w-2.5 h-2.5" /> First message creates an encrypted channel on-chain
                    </>
                  )}
                </span>
              </div>

              {creatingChat && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <RefreshCw className="w-6 h-6 text-[#7C3AED] animate-spin mx-auto mb-2" />
                    <p className="text-sm text-[#7C3AED] font-medium">Creating encrypted channel...</p>
                    <p className="text-xs text-[#94A3B8] mt-1">Establishing keys on Solana</p>
                  </div>
                </div>
              )}

              {loadingMessages && messages.length === 0 && !creatingChat && (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-[#94A3B8] animate-spin" />
                </div>
              )}

              {!loadingMessages && messages.length === 0 && activeChat.exists && !creatingChat && (
                <div className="text-center py-8">
                  <p className="text-sm text-[#94A3B8]">No messages yet. Say hello! 👋</p>
                </div>
              )}

              {!activeChat.exists && messages.length === 0 && !creatingChat && (
                <div className="text-center py-8">
                  <ShieldCheck className="w-10 h-10 text-[#7C3AED] mx-auto mb-3" />
                  <p className="text-sm text-[#64748B] mb-1">End-to-end encrypted messaging</p>
                  <p className="text-xs text-[#94A3B8]">Messages are encrypted with NaCl Box (X25519-XSalsa20-Poly1305)</p>
                  <p className="text-xs text-[#94A3B8] mt-1">Only you and the recipient can read them 🔐</p>
                </div>
              )}

              {messages.filter(m => !m.isKeyExchange).map((msg, i) => {
                const displayText = msg.isEncrypted
                  ? (msg.decrypted || "🔒 Unable to decrypt")
                  : msg.content;
                const isPaymentMsg = displayText.startsWith("💸");

                if (isPaymentMsg) {
                  return (
                    <div key={`${msg.timestamp}-${i}`} className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[280px] rounded-2xl p-3 sm:p-4 ${
                        msg.isMe
                          ? "bg-gradient-to-br from-[#16A34A] to-[#15803D] text-white"
                          : "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] text-[#15803D]"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-xs font-medium">{msg.isMe ? "You sent" : "Received"}</span>
                        </div>
                        <p className="text-lg font-bold">{displayText.replace("💸 ", "")}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Lock className="w-3 h-3" />
                          <span className="text-[10px] opacity-80">Encrypted Payment</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`${msg.timestamp}-${i}`} className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[320px] px-3.5 sm:px-4 py-2.5 rounded-2xl text-sm ${
                        msg.isMe
                          ? "chat-bubble-me bg-[#2563EB] text-white rounded-br-md"
                          : "chat-bubble-them bg-white text-[#1A1A2E] border border-[#E2E8F0] rounded-bl-md"
                      }`}
                    >
                      <p className="break-words">{displayText}</p>
                      <div className={`flex items-center gap-1 mt-1 ${msg.isMe ? "text-blue-200" : "text-[#94A3B8]"}`}>
                        <span className="text-[10px]">
                          {Number(msg.timestamp) > 0 ? timeAgo(Number(msg.timestamp) * 1000) : "now"}
                        </span>
                        {msg.isEncrypted && msg.decrypted && (
                          <Lock className="w-2 h-2 text-[#16A34A]" />
                        )}
                        {msg.isEncrypted && !msg.decrypted && (
                          <AlertCircle className="w-2 h-2 text-[#EF4444]" />
                        )}
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
                    disabled={!paymentAmount || sending}
                    className="px-4 py-2.5 bg-[#16A34A] text-white text-sm font-medium rounded-xl hover:bg-[#15803D] disabled:opacity-40 transition-all"
                  >
                    Send
                  </button>
                </div>
                <p className="text-[10px] text-[#16A34A] mt-1.5 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> SOL transfer on-chain + encrypted receipt in chat
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
                  placeholder={
                    creatingChat
                      ? "Setting up encryption..."
                      : activeChat.exists && !peerPubKey
                      ? "Waiting for key exchange..."
                      : "Type a message — E2E encrypted 🔐"
                  }
                  disabled={sending || creatingChat}
                  className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 sm:px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending || creatingChat}
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
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED]/10 to-[#16A34A]/10 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-[#7C3AED]" />
              </div>
              <h3 className="font-bold text-[#1A1A2E] mb-1">
                {chats.length > 0 ? "Select a conversation" : "No contacts yet"}
              </h3>
              <p className="text-sm text-[#64748B]">
                {chats.length > 0
                  ? "End-to-end encrypted messaging on Solana 🔐"
                  : "Follow people to start encrypted chats"}
              </p>
              <p className="text-[10px] text-[#94A3B8] mt-2">
                NaCl Box (X25519-XSalsa20-Poly1305) • Same crypto as Signal
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
