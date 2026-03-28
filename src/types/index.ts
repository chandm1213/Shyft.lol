export interface UserProfile {
  publicKey: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  createdAt: number;
  avatarUrl?: string;
  bannerUrl?: string;
}

export interface Post {
  id: string;
  author: UserProfile;
  content: string;
  likes: number;
  comments: Comment[];
  createdAt: number;
  isLiked: boolean;
}

export interface Comment {
  id: string;
  author: UserProfile;
  content: string;
  createdAt: number;
}

export interface ChatConversation {
  id: string;
  participant: UserProfile;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  isEncrypted: boolean;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  isPayment: boolean;
  paymentAmount?: number;
  paymentToken?: string;
  paymentStatus?: 'pending' | 'completed' | 'failed';
  isPrivate: boolean;
}

export interface Payment {
  id: string;
  sender: string;
  recipient: string;
  amount: number;
  token: string;
  status: 'depositing' | 'transferring' | 'completed' | 'failed';
  isPrivate: boolean;
  timestamp: number;
  txSignature?: string;
}

export type TabType = 'feed' | 'chat' | 'payments' | 'profile' | 'dashboard' | 'friends';
