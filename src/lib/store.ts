import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Post, ChatConversation, ChatMessage, Payment, UserProfile } from "@/types";

interface AppState {
  // User
  currentUser: UserProfile | null;
  isConnected: boolean;
  setCurrentUser: (user: UserProfile | null) => void;
  setConnected: (connected: boolean) => void;

  // Feed
  posts: Post[];
  addPost: (content: string, isPrivate: boolean) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, content: string) => void;

  // Chat
  conversations: ChatConversation[];
  messages: Record<string, ChatMessage[]>;
  addConversation: (conv: ChatConversation) => void;
  sendMessage: (conversationId: string, content: string) => void;
  sendPaymentMessage: (conversationId: string, amount: number, token: string) => void;

  // Payments
  payments: Payment[];
  addPayment: (payment: Payment) => void;
  updatePaymentStatus: (paymentId: string, status: Payment["status"]) => void;

  // Privacy settings
  friendsOnlyDefault: boolean;
  setFriendsOnlyDefault: (val: boolean) => void;

  // Active tab
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Active chat
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  // User
  currentUser: null,
  isConnected: false,
  setCurrentUser: (user) => set({ currentUser: user }),
  setConnected: (connected) => set({ isConnected: connected }),

  // Feed
  posts: [],
  addPost: (content, isPrivate) => {
    const user = get().currentUser;
    if (!user) return;
    const newPost: Post = {
      id: uuidv4(),
      author: user,
      content,
      isPrivate,
      likes: 0,
      comments: [],
      createdAt: Date.now(),
      isLiked: false,
    };
    set((state) => ({ posts: [newPost, ...state.posts] }));
  },
  toggleLike: (postId) =>
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 }
          : p
      ),
    })),
  addComment: (postId, content) => {
    const user = get().currentUser;
    if (!user) return;
    const comment = { id: uuidv4(), author: user, content, createdAt: Date.now() };
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
      ),
    }));
  },

  // Chat
  conversations: [],
  messages: {},
  addConversation: (conv) =>
    set((state) => {
      if (state.conversations.find((c) => c.id === conv.id)) return state;
      return { conversations: [conv, ...state.conversations] };
    }),
  sendMessage: (conversationId, content) => {
    const msg: ChatMessage = {
      id: uuidv4(),
      sender: "me",
      content,
      timestamp: Date.now(),
      isPayment: false,
      isPrivate: true,
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), msg],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: content, lastMessageTime: Date.now(), unreadCount: 0 }
          : c
      ),
    }));
  },
  sendPaymentMessage: (conversationId, amount, token) => {
    const paymentMsg: ChatMessage = {
      id: uuidv4(),
      sender: "me",
      content: "",
      timestamp: Date.now(),
      isPayment: true,
      paymentAmount: amount,
      paymentToken: token,
      paymentStatus: "completed",
      isPrivate: true,
    };
    const conv = get().conversations.find((c) => c.id === conversationId);
    const payment: Payment = {
      id: uuidv4(),
      sender: "me",
      recipient: conv?.participant.publicKey || "",
      amount,
      token,
      status: "completed",
      isPrivate: true,
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), paymentMsg],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: `Sent ${amount} ${token}`, lastMessageTime: Date.now() }
          : c
      ),
      payments: [payment, ...state.payments],
    }));
  },

  // Payments
  payments: [],
  addPayment: (payment) => set((state) => ({ payments: [payment, ...state.payments] })),
  updatePaymentStatus: (paymentId, status) =>
    set((state) => ({
      payments: state.payments.map((p) => (p.id === paymentId ? { ...p, status } : p)),
    })),

  // Privacy settings
  friendsOnlyDefault: true,
  setFriendsOnlyDefault: (val) => set({ friendsOnlyDefault: val }),

  // Navigation
  activeTab: "feed",
  setActiveTab: (tab) => set({ activeTab: tab }),

  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
    }),
    {
      name: "shadowspace-storage",
      partialize: (state) => ({
        posts: state.posts,
        conversations: state.conversations,
        messages: state.messages,
        payments: state.payments,
        friendsOnlyDefault: state.friendsOnlyDefault,
      }),
    }
  )
);
