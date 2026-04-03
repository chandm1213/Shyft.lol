import { Program, AnchorProvider, Idl, BN, BorshCoder } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import idl from "./idl.json";
import {
  encryptMessage as naclEncrypt,
  decryptMessage as naclDecrypt,
  formatPubkeyMessage,
  parsePubkeyMessage,
  isEncryptedMessage,
  isPubkeyMessage,
} from "./encryption";
import { checkUsername } from "./reserved-usernames";

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

// ========== IPFS URL Helpers ==========
// On-chain fields are limited to 128 bytes. Full IPFS URLs can be 130+ chars.
// We store only the CID on-chain and reconstruct the full URL client-side.
const IPFS_GATEWAY = "gateway.pinata.cloud";
const IPFS_CID_REGEX = /\/ipfs\/([a-zA-Z0-9]+)(?:\/[^?#]*)?(\?.*)?$/;

/** Strip a full IPFS URL down to just the CID (for on-chain storage). */
function compressIpfsUrl(url: string): string {
  if (!url) return url;
  const match = url.match(IPFS_CID_REGEX);
  if (match) return match[1]; // just the CID
  return url; // not an IPFS URL — store as-is
}

/** Expand a bare CID back to a full IPFS gateway URL. */
function expandIpfsUrl(stored: string): string {
  if (!stored) return stored;
  // Already a full URL — return as-is
  if (stored.startsWith("http")) return stored;
  // Looks like a bare CID (bafkrei... or Qm...)
  if (stored.startsWith("baf") || stored.startsWith("Qm")) {
    return `https://${IPFS_GATEWAY}/ipfs/${stored}`;
  }
  return stored;
}

const PROFILE_SEED = Buffer.from("profile");
const POST_SEED = Buffer.from("post");
const CHAT_SEED = Buffer.from("chat");
const MESSAGE_SEED = Buffer.from("message");
const FOLLOW_SEED = Buffer.from("follow");
const COMMENT_SEED = Buffer.from("comment");
const REACTION_SEED = Buffer.from("reaction");
const COMMUNITY_SEED = Buffer.from("community");
const MEMBERSHIP_SEED = Buffer.from("membership");

// ========== Simple In-Memory Cache ==========

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class RpcCache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL: number; // ms

  constructor(ttlMs = 30_000) {
    this.defaultTTL = ttlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) this.cache.delete(key);
    }
  }
}

/** Shared cache — 10s TTL. Cleared on write operations. */
const rpcCache = new RpcCache(10_000);

/** Clear all cached RPC data (call after tab switch, refresh, etc.) */
export function clearRpcCache(): void {
  rpcCache.invalidate();
}

// ========== Treasury Sponsorship ==========

/** Cached treasury public key (fetched once from /api/sponsor-tx) */
let _treasuryPubkey: PublicKey | null = null;

/** Get the platform treasury public key (fee payer for sponsored txs) */
export async function getTreasuryPubkey(): Promise<PublicKey> {
  if (_treasuryPubkey) return _treasuryPubkey;
  const res = await fetch("/api/sponsor-tx");
  const data = await res.json();
  if (!data.treasuryPubkey) throw new Error("Could not fetch treasury pubkey");
  _treasuryPubkey = new PublicKey(data.treasuryPubkey);
  return _treasuryPubkey;
}

/**
 * Send a partially-signed transaction to the backend for treasury co-signing + submission.
 * The tx must have feePayer = treasury. The user/session key signs first, then backend adds treasury sig.
 */
export async function sponsorTransaction(tx: Transaction, walletAddress: string): Promise<string> {
  // Debug: log all program IDs in the transaction before sending
  console.log("📋 sponsor-tx: programs in transaction:", tx.instructions.map(ix => ix.programId.toBase58()));

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const res = await fetch("/api/sponsor-tx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction: serialized.toString("base64"),
      walletAddress,
    }),
  });
  const data = await res.json();
  if (!data.success) {
    console.error("❌ sponsor-tx failed:", data.error);
    throw new Error(data.error || "Sponsor transaction failed");
  }
  return data.signature;
}

// ========== Helpers ==========

/** Convert u64 to little-endian 8 bytes (matches Rust's to_le_bytes()) */
function toLEBytes(num: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  // Write as little-endian u64
  view.setBigUint64(0, BigInt(num), true);
  return new Uint8Array(buffer);
}

/** Browser-safe u64 to big-endian 8 bytes (alternative encoding) */
function toBEBytes(num: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  // Write as big-endian u64
  view.setBigUint64(0, BigInt(num), false);
  return new Uint8Array(buffer);
}

// ========== PDA Derivation Helpers ==========

function getProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PROFILE_SEED, owner.toBuffer()], PROGRAM_ID);
}

function getPostPda(author: PublicKey, postId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([POST_SEED, author.toBuffer(), toLEBytes(postId)], PROGRAM_ID);
}

function getChatPda(chatId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CHAT_SEED, toLEBytes(chatId)], PROGRAM_ID);
}

function getMessagePda(chatId: number, messageIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MESSAGE_SEED, toLEBytes(chatId), toLEBytes(messageIndex)], PROGRAM_ID);
}

function getFollowPda(follower: PublicKey, following: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([FOLLOW_SEED, follower.toBuffer(), following.toBuffer()], PROGRAM_ID);
}

function getCommentPda(postPda: PublicKey, commentIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([COMMENT_SEED, postPda.toBuffer(), toLEBytes(commentIndex)], PROGRAM_ID);
}

function getReactionPda(postPda: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REACTION_SEED, postPda.toBuffer(), user.toBuffer()], PROGRAM_ID);
}

function getCommunityPda(communityId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([COMMUNITY_SEED, toLEBytes(communityId)], PROGRAM_ID);
}

function getMembershipPda(communityPda: PublicKey, member: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MEMBERSHIP_SEED, communityPda.toBuffer(), member.toBuffer()], PROGRAM_ID);
}

export class ShyftClient {
  program: Program;
  provider: AnchorProvider;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.program = new Program(idl as Idl, provider);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get accounts(): any {
    return this.program.account;
  }

  // ========== PROFILE ==========

  async createProfile(username: string, displayName: string, bio: string, inviteCode?: string): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);

    // Block reserved/squatted usernames
    const reserved = checkUsername(username, inviteCode);
    if (reserved.blocked) {
      throw new Error(reserved.reason || "This username is reserved");
    }

    // Try to migrate first if existing profile is undersized
    try {
      const acctInfo = await this.provider.connection.getAccountInfo(profilePda);
      if (acctInfo && acctInfo.data.length < 8 + 307) {
        // Account exists but is too small for new schema — migrate it
        console.log("🔄 Existing profile needs migration, resizing...");
        await this.migrateProfile();
        console.log("✅ Profile migrated to new schema");
        return "migrated";
      }
    } catch (e) {
      // ignore — account may not exist yet
    }

    // Use treasury as payer so user never needs SOL
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .createProfile(username, displayName, bio)
      .accounts({
        profile: profilePda,
        user,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;

    // User signs (wallet popup) — they are the 'user' signer, not the payer
    const signed = await this.provider.wallet.signTransaction(tx);

    // Send to backend for treasury co-signature + submission
    const sig = await sponsorTransaction(signed, user.toBase58());
    return sig;
  }

  async migrateProfile(): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .migrateProfile()
      .accounts({
        profile: profilePda,
        user,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;

    // User signs
    const signedTx = await this.provider.wallet.signTransaction(tx);

    // Treasury co-signs and sends
    const sig = await sponsorTransaction(signedTx, user.toBase58());
    return sig;
  }

  async getProfile(owner: PublicKey): Promise<any> {
    const [profilePda] = getProfilePda(owner);
    try {
      const profile = await this.accounts.profile.fetch(profilePda);
      // Expand bare CIDs back to full IPFS gateway URLs
      if (profile) {
        profile.avatarUrl = expandIpfsUrl(profile.avatarUrl || "");
        profile.bannerUrl = expandIpfsUrl(profile.bannerUrl || "");
      }
      return profile;
    } catch (err: any) {
      // Check if account exists but can't be deserialized (size mismatch)
      try {
        const acctInfo = await this.provider.connection.getAccountInfo(profilePda);
        if (acctInfo && acctInfo.data.length > 0) {
          // If this is OUR profile, auto-migrate
          const wallet = this.provider.wallet.publicKey;
          if (wallet && owner.equals(wallet)) {
            console.log("🔄 Profile account exists but schema mismatch — auto-migrating...");
            await this.migrateProfile();
            return await this.accounts.profile.fetch(profilePda);
          }
          console.warn("⚠️ Profile for", owner.toBase58().slice(0, 8), "needs migration (old schema)");
          return null;
        }
      } catch {
        // Account truly doesn't exist
      }
      return null;
    }
  }

  /** Check if a username is already taken by any profile on-chain */
  async isUsernameTaken(username: string, excludeOwner?: PublicKey): Promise<boolean> {
    const profiles = await this.getAllProfiles();
    const lower = username.toLowerCase();
    return profiles.some(
      (p: any) =>
        p.username?.toLowerCase() === lower &&
        (!excludeOwner || p.owner !== excludeOwner.toBase58())
    );
  }

  async updateProfile(displayName: string, bio: string, avatarUrl: string, bannerUrl: string): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const treasury = await getTreasuryPubkey();

    // Auto-migrate profile if account is undersized (e.g. avatar/banner fields grew)
    try {
      const acctInfo = await this.provider.connection.getAccountInfo(profilePda);
      const expectedSize = 8 + 32 + (4+16) + (4+24) + (4+64) + 1 + 4 + 4 + 4 + 2 + 8 + (4+128) + (4+128); // 8 + Profile::LEN
      if (acctInfo && acctInfo.data.length < expectedSize) {
        console.log(`Profile account undersized (${acctInfo.data.length} < ${expectedSize}), migrating...`);
        await this.migrateProfile();
      }
    } catch (e) {
      console.warn("Migration check failed, continuing:", e);
    }

    // Compress IPFS URLs to bare CIDs for on-chain storage (128 byte limit)
    const compressedAvatar = compressIpfsUrl(avatarUrl);
    const compressedBanner = compressIpfsUrl(bannerUrl);

    const ix = await this.program.methods
      .updateProfile(displayName, bio, compressedAvatar, compressedBanner)
      .accounts({
        profile: profilePda,
        user,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user.toBase58());
    
    rpcCache.invalidate("profile_" + user.toBase58());
    return sig;
  }

  // ========== POSTS ==========

  async createPost(postId: number, content: string, isPrivate: boolean): Promise<string> {
    const wallet = this.provider.wallet.publicKey;
    if (!wallet) {
      throw new Error("Wallet not connected - no public key available");
    }

    console.log("=== Creating Post ===");
    console.log("Author:", wallet.toBase58());
    console.log("Post ID:", postId);

    try {
      const treasury = await getTreasuryPubkey();
      const [profilePda] = getProfilePda(wallet);
      const [postPda] = getPostPda(wallet, postId);

      const ix = await this.program.methods
        .createPost(new BN(postId), content, isPrivate)
        .accountsPartial({
          profile: profilePda,
          author: wallet,
          payer: treasury,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = treasury;
      tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      const signed = await this.provider.wallet.signTransaction(tx);
      const sig = await sponsorTransaction(signed, wallet.toBase58());

      console.log("Post created (treasury sponsored):", sig);
      rpcCache.invalidate("allPosts");
      return sig;
    } catch (err: any) {
      console.error("Create post error:", err);
      throw err;
    }
  }

  async getPost(author: PublicKey, postId: number): Promise<any> {
    const [postPda] = getPostPda(author, postId);
    try {
      return await this.accounts.post.fetch(postPda);
    } catch {
      return null;
    }
  }

  async deletePost(postId: number): Promise<string> {
    const wallet = this.provider.wallet.publicKey;
    if (!wallet) throw new Error("Wallet not connected");

    console.log("=== Deleting Post ===");
    console.log("Author:", wallet.toBase58());
    console.log("Post ID:", postId);

    try {
      const treasury = await getTreasuryPubkey();
      const [profilePda] = getProfilePda(wallet);
      const [postPda] = getPostPda(wallet, postId);

      const ix = await this.program.methods
        .closePost(new BN(postId))
        .accountsPartial({
          post: postPda,
          profile: profilePda,
          user: wallet,
          treasury,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = treasury;
      tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      const signed = await this.provider.wallet.signTransaction(tx);
      const sig = await sponsorTransaction(signed, wallet.toBase58());

      console.log("Post deleted (rent refunded to treasury on-chain):", sig);
      rpcCache.invalidate("allPosts");
      return sig;
    } catch (err: any) {
      console.error("Delete post error:", err);
      throw err;
    }
  }

  async getAllPublicPosts(): Promise<any[]> {
    try {
      const allPosts = await this.accounts.post.all();
      return allPosts
        .map((p: any) => ({
          publicKey: p.publicKey.toBase58(),
          ...p.account,
          author: p.account.author.toBase58(),
          postId: p.account.postId?.toString(),
          likes: p.account.likes?.toString() || "0",
          commentCount: p.account.commentCount?.toString() || "0",
          createdAt: p.account.createdAt?.toString() || "0",
        }))
        .filter((p: any) => !p.isPrivate)
        .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt));
    } catch {
      return [];
    }
  }

  async getPostsByAuthor(author: PublicKey): Promise<any[]> {
    try {
      const allPosts = await this.accounts.post.all();
      const authorStr = author.toBase58();
      return allPosts
        .map((p: any) => ({
          publicKey: p.publicKey.toBase58(),
          ...p.account,
          author: p.account.author.toBase58(),
          postId: p.account.postId?.toString(),
          likes: p.account.likes?.toString() || "0",
          commentCount: p.account.commentCount?.toString() || "0",
          createdAt: p.account.createdAt?.toString() || "0",
        }))
        .filter((p: any) => p.author === authorStr)
        .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt));
    } catch {
      return [];
    }
  }

  /** Fetch ALL posts from on-chain */
  async getAllPosts(): Promise<{ publicKey: string; author: string; postId: string; content: string; isPrivate: boolean; likes: string; commentCount: string; createdAt: string }[]> {
    const cacheKey = "allPosts";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    const regularPosts = await this.accounts.post.all();
    const mapped = regularPosts.map((p: any) => ({
      publicKey: p.publicKey.toBase58(),
      author: p.account.author.toBase58(),
      postId: p.account.postId?.toString() || "0",
      content: p.account.content || "",
      isPrivate: p.account.isPrivate,
      likes: p.account.likes?.toString() || "0",
      commentCount: p.account.commentCount?.toString() || "0",
      createdAt: p.account.createdAt?.toString() || "0",
    }));

    rpcCache.set(cacheKey, mapped);
    return mapped;
  }

  async getAllProfiles(): Promise<any[]> {
    const cacheKey = "allProfiles";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch all profiles
      let result: any[] = [];
      try {
        const allProfiles = await this.accounts.profile.all();
        result = allProfiles.map((p: any) => ({
          publicKey: p.publicKey.toBase58(),
          ...p.account,
          owner: p.account.owner.toBase58(),
          avatarUrl: expandIpfsUrl(p.account.avatarUrl || ""),
          bannerUrl: expandIpfsUrl(p.account.bannerUrl || ""),
        }));
      } catch {
        console.warn("⚠️ getAllProfiles via Anchor failed, using raw fetch");
      }

      rpcCache.set(cacheKey, result);
      return result;
    } catch {
      return [];
    }
  }

  async likePost(author: PublicKey, postId: number): Promise<string> {
    const [postPda] = getPostPda(author, postId);
    const wallet = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(wallet);

    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .likePost(new BN(postId))
      .accountsPartial({
        post: postPda,
        profile: profilePda,
        user: wallet,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, wallet.toBase58());
    return sig;
  }

  // ========== COMMENTS ==========

  async createComment(author: PublicKey, postId: number, commentIndex: number, content: string): Promise<string> {
    const [postPda] = getPostPda(author, postId);
    const [commentPda] = getCommentPda(postPda, commentIndex);
    const wallet = this.provider.wallet.publicKey;
    const [commenterProfilePda] = getProfilePda(wallet);

    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .createComment(new BN(postId), new BN(commentIndex), content)
      .accountsPartial({
        comment: commentPda,
        post: postPda,
        commenterProfile: commenterProfilePda,
        author: wallet,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, wallet.toBase58());

    rpcCache.invalidate("allComments");
    rpcCache.invalidate("allPosts");
    return sig;
  }

  async deleteComment(postAuthor: PublicKey, postId: number, commentIndex: number): Promise<string> {
    const wallet = this.provider.wallet.publicKey;
    if (!wallet) throw new Error("Wallet not connected");

    const treasury = await getTreasuryPubkey();
    const [postPda] = getPostPda(postAuthor, postId);
    const [commentPda] = getCommentPda(postPda, commentIndex);

    const ix = await this.program.methods
      .closeComment(new BN(postId), new BN(commentIndex))
      .accountsPartial({
        comment: commentPda,
        post: postPda,
        user: wallet,
        treasury,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, wallet.toBase58());

    console.log("Comment deleted (rent refunded to treasury on-chain):", sig);
    rpcCache.invalidate("allComments");
    rpcCache.invalidate("allPosts");
    return sig;
  }

  async getAllComments(): Promise<{ publicKey: string; post: string; author: string; commentIndex: string; content: string; createdAt: string }[]> {
    const cacheKey = "allComments";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const allComments = await this.accounts.comment.all();
      const result = allComments.map((c: any) => ({
        publicKey: c.publicKey.toBase58(),
        post: c.account.post.toBase58(),
        author: c.account.author.toBase58(),
        commentIndex: c.account.commentIndex?.toString() || "0",
        content: c.account.content || "",
        createdAt: c.account.createdAt?.toString() || "0",
      }));
      rpcCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error("getAllComments error:", err);
      return [];
    }
  }

  async getCommentsForPost(postPublicKey: string): Promise<{ publicKey: string; post: string; author: string; commentIndex: string; content: string; createdAt: string }[]> {
    const all = await this.getAllComments();
    return all
      .filter((c) => c.post === postPublicKey)
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  }

  // ========== REACTIONS ==========

  async reactToPost(author: PublicKey, postId: number, reactionType: number): Promise<string> {
    const wallet = this.provider.wallet.publicKey;
    const [postPda] = getPostPda(author, postId);
    const [reactionPda] = getReactionPda(postPda, wallet);
    const [reactorProfilePda] = getProfilePda(wallet);

    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .reactToPost(new BN(postId), reactionType)
      .accountsPartial({
        reaction: reactionPda,
        post: postPda,
        reactorProfile: reactorProfilePda,
        user: wallet,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, wallet.toBase58());

    rpcCache.invalidate("allReactions");
    return sig;
  }

  async removeReaction(author: PublicKey, postId: number): Promise<string> {
    const wallet = this.provider.wallet.publicKey;
    if (!wallet) throw new Error("Wallet not connected");

    const treasury = await getTreasuryPubkey();
    const [postPda] = getPostPda(author, postId);
    const [reactionPda] = getReactionPda(postPda, wallet);

    const ix = await this.program.methods
      .closeReaction(new BN(postId))
      .accountsPartial({
        reaction: reactionPda,
        post: postPda,
        user: wallet,
        treasury,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, wallet.toBase58());

    console.log("Reaction removed (rent refunded to treasury on-chain):", sig);
    rpcCache.invalidate("allReactions");
    return sig;
  }

  async getAllReactions(): Promise<{ publicKey: string; post: string; user: string; reactionType: number }[]> {
    const cacheKey = "allReactions";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const allReactions = await this.accounts.reaction.all();
      const result = allReactions.map((r: any) => ({
        publicKey: r.publicKey.toBase58(),
        post: r.account.post.toBase58(),
        user: r.account.user.toBase58(),
        reactionType: r.account.reactionType,
      }));
      rpcCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error("getAllReactions error:", err);
      return [];
    }
  }

  async getReactionsForPost(postPublicKey: string): Promise<{ publicKey: string; post: string; user: string; reactionType: number }[]> {
    const all = await this.getAllReactions();
    return all.filter((r) => r.post === postPublicKey);
  }

  // ========== CHAT ==========

  async createChat(chatId: number, user2: PublicKey): Promise<string> {
    const user1 = this.provider.wallet.publicKey;
    const [chatPda] = getChatPda(chatId);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .createChat(new BN(chatId))
      .accounts({
        chat: chatPda,
        user1,
        user2,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user1.toBase58());
    return sig;
  }

  async sendMessage(
    chatId: number,
    messageIndex: number,
    content: string,
    isPayment: boolean = false,
    paymentAmount: number = 0
  ): Promise<string> {
    const sender = this.provider.wallet.publicKey;
    const [messagePda] = getMessagePda(chatId, messageIndex);
    const [chatPda] = getChatPda(chatId);

    // Step 1: Send the message on-chain (treasury-sponsored)
    const treasury = await getTreasuryPubkey();
    const ix = await this.program.methods
      .sendMessage(new BN(chatId), new BN(messageIndex), content, isPayment, new BN(paymentAmount))
      .accounts({
        message: messagePda,
        chat: chatPda,
        sender,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, sender.toBase58());
    console.log("✅ Message sent on-chain (treasury sponsored):", sig);

    // Invalidate message caches after sending
    rpcCache.invalidate("messages:");
    rpcCache.invalidate("allMessages");

    return sig;
  }

  async getChat(chatId: number): Promise<any> {
    const [chatPda] = getChatPda(chatId);
    try {
      return await this.accounts.chat.fetch(chatPda);
    } catch {
      return null;
    }
  }

  async getMessage(chatId: number, messageIndex: number): Promise<any> {
    const [messagePda] = getMessagePda(chatId, messageIndex);
    try {
      return await this.accounts.message.fetch(messagePda);
    } catch {
      return null;
    }
  }

  /** Fetch all chats involving the current user. */
  async getAllChatsForUser(friendPubkeys: PublicKey[] = []): Promise<any[]> {
    const cacheKey = "allChatsForUser";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    const coder = new BorshCoder(idl as Idl);
    const user = this.provider.wallet.publicKey;
    const userStr = user.toBase58();

    // 1. Regular chats from our program
    const allChats = await this.accounts.chat.all();
    const mapped: any[] = allChats
      .map((c: any) => ({
        publicKey: c.publicKey.toBase58(),
        chatId: c.account.chatId?.toString() || "0",
        user1: c.account.user1?.toBase58() || "",
        user2: c.account.user2?.toBase58() || "",
        messageCount: Number(c.account.messageCount || 0),
        createdAt: c.account.createdAt?.toString() || "0",
      }))
      .filter((c: any) => c.user1 === userStr || c.user2 === userStr);

    // Deduplicate
    const seen = new Set<string>();
    const result = mapped.filter((c: any) => {
      if (seen.has(c.publicKey)) return false;
      seen.add(c.publicKey);
      return true;
    });
    rpcCache.set(cacheKey, result);
    return result;
  }

  /** Fetch all messages for a specific chat. */
  async getMessagesForChat(chatId: number): Promise<any[]> {
    const cacheKey = `messages:${chatId}`;
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    const coder = new BorshCoder(idl as Idl);
    const chatIdStr = chatId.toString();

    // 1. Regular messages — fetch all and filter by chatId in JS
    // Use cached allMessages if available
    const allMessages = await this._getAllMessages();
    const mapped: any[] = allMessages
      .filter((m: any) => m.chatId === chatIdStr);

    // Deduplicate and sort by message index
    const seen = new Set<string>();
    const result = mapped
      .filter((m: any) => {
        if (seen.has(m.publicKey)) return false;
        seen.add(m.publicKey);
        return true;
      })
      .sort((a: any, b: any) => a.messageIndex - b.messageIndex);

    rpcCache.set(cacheKey, result, 15_000); // 15s cache for messages
    return result;
  }

  /** Cached fetch of all message accounts (raw mapped). */
  private async _getAllMessages(): Promise<any[]> {
    const cacheKey = "allMessages";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const allMessages = await this.accounts.message.all();
      const mapped = allMessages.map((m: any) => ({
        publicKey: m.publicKey.toBase58(),
        chatId: m.account.chatId?.toString() || "0",
        messageIndex: Number(m.account.messageIndex || 0),
        sender: m.account.sender?.toBase58() || "",
        content: m.account.content || "",
        isPayment: m.account.isPayment || false,
        paymentAmount: Number(m.account.paymentAmount || 0),
        timestamp: m.account.timestamp?.toString() || "0",
      }));
      rpcCache.set(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  }

  /** Fetch all payment messages across all chats involving the current user. */
  async getAllPaymentsForUser(): Promise<any[]> {
    const coder = new BorshCoder(idl as Idl);
    const user = this.provider.wallet.publicKey;
    const userStr = user.toBase58();

    // 1. Get all chats involving this user
    const allChats = await this.accounts.chat.all();
    const userChats = allChats
      .map((c: any) => ({
        chatId: c.account.chatId?.toString() || "0",
        user1: c.account.user1?.toBase58() || "",
        user2: c.account.user2?.toBase58() || "",
      }))
      .filter((c: any) => c.user1 === userStr || c.user2 === userStr);

    const userChatIds = new Set(userChats.map((c: any) => c.chatId));

    // Build a map of chatId -> other participant
    const chatParticipant: Record<string, string> = {};
    for (const c of userChats) {
      chatParticipant[c.chatId] = c.user1 === userStr ? c.user2 : c.user1;
    }

    const payments: any[] = [];

    // 2. Use cached messages instead of fetching fresh
    const allMessages = await this._getAllMessages();
    for (const m of allMessages) {
      if (!userChatIds.has(m.chatId)) continue;
      if (!m.isPayment) continue;

      const isSent = m.sender === userStr;

      payments.push({
        id: m.publicKey,
        sender: isSent ? "me" : m.sender,
        recipient: isSent ? (chatParticipant[m.chatId] || "") : "me",
        amount: Number(m.paymentAmount || 0) / 1_000_000, // micro-SOL -> SOL
        token: "SOL",
        status: "completed" as const,
        isPrivate: true,
        timestamp: Number(m.timestamp || "0") * 1000,
        content: m.content || "",
      });
    }

    // Sort by timestamp descending (newest first)
    return payments.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Create a chat (simple wrapper around createChat for backwards compatibility) */
  async createPrivateChatFull(
    chatId: number,
    user2: PublicKey
  ): Promise<{ createSig: string }> {
    const user1 = this.provider.wallet.publicKey;
    if (!user1) throw new Error("Wallet not connected");

    console.log("💬 Creating chat:", chatId, "Between:", user1.toBase58().slice(0, 8), "and", user2.toBase58().slice(0, 8));
    const createSig = await this.createChat(chatId, user2);
    console.log("✅ Chat created:", createSig);

    return { createSig };
  }

  // ========== E2E ENCRYPTED CHAT ==========

  /**
   * Create an E2E encrypted chat with another user.
   * 1. Creates the on-chain chat PDA
   * 2. Publishes sender's encryption public key as the first message
   */
  async createE2EChat(
    chatId: number,
    user2: PublicKey,
    myEncryptionPublicKey: Uint8Array
  ): Promise<{ chatSig: string; keySig: string }> {
    // Step 1: Create chat
    const chatSig = await this.createChat(chatId, user2);
    console.log("✅ E2E Chat created:", chatSig);

    // Step 2: Publish our encryption public key as message index 0
    const pubkeyContent = formatPubkeyMessage(myEncryptionPublicKey);
    const keySig = await this.sendMessageSimple(chatId, 0, pubkeyContent);
    console.log("✅ Encryption pubkey published:", keySig);

    return { chatSig, keySig };
  }

  /**
   * Send a message on-chain.
   * Used for key exchange messages and encrypted chat messages.
   */
  async sendMessageSimple(
    chatId: number,
    messageIndex: number,
    content: string,
    isPayment: boolean = false,
    paymentAmount: number = 0
  ): Promise<string> {
    const sender = this.provider.wallet.publicKey;
    const [messagePda] = getMessagePda(chatId, messageIndex);
    const [chatPda] = getChatPda(chatId);

    // Treasury-sponsored: user doesn't pay gas
    const treasury = await getTreasuryPubkey();
    const ix = await this.program.methods
      .sendMessage(new BN(chatId), new BN(messageIndex), content, isPayment, new BN(paymentAmount))
      .accounts({
        message: messagePda,
        chat: chatPda,
        sender,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, sender.toBase58());

    // Wait for confirmation so on-chain state is readable immediately
    await this.provider.connection.confirmTransaction(sig, "confirmed");

    // Invalidate caches
    rpcCache.invalidate("messages:");
    rpcCache.invalidate("allMessages");
    rpcCache.invalidate("allChatsForUser");

    return sig;
  }

  /**
   * Send an E2E encrypted message.
   * Encrypts the plaintext with NaCl box, then stores the ciphertext on-chain.
   */
  async sendE2EMessage(
    chatId: number,
    messageIndex: number,
    plaintext: string,
    mySecretKey: Uint8Array,
    theirPublicKey: Uint8Array,
    isPayment: boolean = false,
    paymentAmount: number = 0
  ): Promise<string> {
    const encryptedContent = naclEncrypt(plaintext, mySecretKey, theirPublicKey);
    return this.sendMessageSimple(chatId, messageIndex, encryptedContent, isPayment, paymentAmount);
  }

  /**
   * Get the next available message index by scanning PDAs directly.
   * Does NOT rely on chat.messageCount which can be stale.
   */
  async getNextMessageIndex(chatId: number): Promise<number> {
    for (let i = 0; i < 100; i++) {
      const [pda] = getMessagePda(chatId, i);
      const accInfo = await this.provider.connection.getAccountInfo(pda, "confirmed");
      if (!accInfo) return i;
    }
    return 100; // fallback
  }

  /**
   * Publish encryption public key in an existing chat (for the second participant).
   * Sends it as the next available message index.
   */
  async publishEncryptionKey(
    chatId: number,
    messageIndex: number,
    encryptionPublicKey: Uint8Array
  ): Promise<string> {
    const content = formatPubkeyMessage(encryptionPublicKey);
    return this.sendMessageSimple(chatId, messageIndex, content);
  }

  /**
   * Find the encryption public key of the OTHER participant in a chat.
   * Does DIRECT PDA lookups (no cache) to ensure fresh data.
   */
  async findPeerEncryptionKey(chatId: number, myAddress: string): Promise<Uint8Array | null> {
    // Scan message PDAs 0-9 directly — do NOT rely on chat.messageCount
    // because the chat account may be stale/cached even with getAccountInfo
    console.log(`findPeerEncryptionKey: chatId=${chatId}, myAddr=${myAddress.slice(0, 8)}...`);

    const coder = new BorshCoder(idl as Idl);
    let consecutiveMisses = 0;
    for (let i = 0; i < 10; i++) {
      try {
        const [pda] = getMessagePda(chatId, i);
        const accInfo = await this.provider.connection.getAccountInfo(pda, "confirmed");
        if (!accInfo) {
          consecutiveMisses++;
          // If we've missed 3+ in a row, no more messages exist
          if (consecutiveMisses >= 3) break;
          continue;
        }
        consecutiveMisses = 0;
        const msg = coder.accounts.decode("Message", accInfo.data);
        const sender = msg.sender?.toBase58() || "";
        const content = (msg.content as string) || "";
        console.log(`  msg[${i}]: sender=${sender.slice(0, 8)}... content=${content.slice(0, 40)}`);
        if (sender === myAddress) continue;
        if (isPubkeyMessage(content)) {
          const key = parsePubkeyMessage(content);
          if (key && key.length === 32) {
            console.log(`  ✅ Found peer key at msg[${i}]!`);
            return key;
          }
        }
      } catch (err) {
        console.log(`  msg[${i}]: fetch failed (${err})`);
      }
    }
    console.log("  ❌ No peer key found");
    return null;
  }

  /**
   * Find MY encryption public key in a chat (to check if already published).
   * Does DIRECT PDA lookups (no cache) to ensure fresh data.
   */
  async findMyEncryptionKey(chatId: number, myAddress: string): Promise<boolean> {
    // Scan message PDAs 0-9 directly — do NOT rely on chat.messageCount
    const coder = new BorshCoder(idl as Idl);
    let consecutiveMisses = 0;
    for (let i = 0; i < 10; i++) {
      try {
        const [pda] = getMessagePda(chatId, i);
        const accInfo = await this.provider.connection.getAccountInfo(pda, "confirmed");
        if (!accInfo) {
          consecutiveMisses++;
          if (consecutiveMisses >= 3) break;
          continue;
        }
        consecutiveMisses = 0;
        const msg = coder.accounts.decode("Message", accInfo.data);
        const sender = msg.sender?.toBase58() || "";
        const content = (msg.content as string) || "";
        if (sender === myAddress && isPubkeyMessage(content)) {
          return true;
        }
      } catch {
        // skip
      }
    }
    return false;
  }

  /**
   * Fetch and decrypt all messages for a chat.
   * Returns decrypted plaintext for encrypted messages,
   * or raw content for unencrypted / key-exchange messages.
   */
  async getDecryptedMessages(
    chatId: number,
    myAddress: string,
    mySecretKey: Uint8Array,
    peerPublicKey: Uint8Array
  ): Promise<{
    publicKey: string;
    chatId: string;
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
  }[]> {
    const rawMessages = await this.getMessagesForChat(chatId);

    return rawMessages.map((msg: any) => {
      const isMe = msg.sender === myAddress;
      const isKeyEx = isPubkeyMessage(msg.content);
      const isEnc = isEncryptedMessage(msg.content);
      const isPlain = (msg.content as string).startsWith("PLAIN:");

      let decrypted: string | null = null;
      if (isPlain) {
        // Pre-key-exchange plaintext message
        decrypted = (msg.content as string).slice(6);
      } else if (isEnc) {
        // E2E encrypted — decrypt with peer's public + our secret
        decrypted = naclDecrypt(msg.content, peerPublicKey, mySecretKey);
      }

      return {
        publicKey: msg.publicKey,
        chatId: msg.chatId,
        messageIndex: msg.messageIndex,
        sender: msg.sender,
        content: msg.content,
        decrypted,
        isPayment: msg.isPayment,
        paymentAmount: msg.paymentAmount,
        timestamp: msg.timestamp,
        isKeyExchange: isKeyEx,
        isEncrypted: isEnc || isPlain,
        isMe,
      };
    });
  }

  /**
   * Get or create a chat with another user.
   * If a chat already exists (either direction), returns it.
   * Otherwise creates a new one with key exchange.
   */
  async getOrCreateE2EChat(
    user2: PublicKey,
    myEncryptionPublicKey: Uint8Array
  ): Promise<{ chatId: number; isNew: boolean }> {
    const user1 = this.provider.wallet.publicKey;
    const chatId = deriveChatId(user1, user2);

    // Check if chat already exists
    const existing = await this.getChat(chatId);
    if (existing) {
      // Chat exists — check if we've published our key
      const myAddr = user1.toBase58();
      const hasMyKey = await this.findMyEncryptionKey(chatId, myAddr);
      if (!hasMyKey) {
        // Publish our key using direct PDA scan for next index
        const msgIndex = await this.getNextMessageIndex(chatId);
        await this.publishEncryptionKey(chatId, msgIndex, myEncryptionPublicKey);
      }
      return { chatId, isNew: false };
    }

    // Create new chat + publish key
    await this.createE2EChat(chatId, user2, myEncryptionPublicKey);
    return { chatId, isNew: true };
  }

  // ========== FOLLOW ==========

  async followUser(targetPubkey: PublicKey): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [followerProfilePda] = getProfilePda(user);
    const [followingProfilePda] = getProfilePda(targetPubkey);
    const [followPda] = getFollowPda(user, targetPubkey);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .followUser()
      .accounts({
        followAccount: followPda,
        followerProfile: followerProfilePda,
        followingProfile: followingProfilePda,
        user,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user.toBase58());
    rpcCache.invalidate("allFollows");
    return sig;
  }

  async unfollowUser(targetPubkey: PublicKey): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [followerProfilePda] = getProfilePda(user);
    const [followingProfilePda] = getProfilePda(targetPubkey);
    const [followPda] = getFollowPda(user, targetPubkey);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .unfollowUser()
      .accounts({
        followAccount: followPda,
        followerProfile: followerProfilePda,
        followingProfile: followingProfilePda,
        user,
        treasury,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user.toBase58());
    console.log("Unfollowed (rent refunded to treasury on-chain):", sig);
    rpcCache.invalidate("allFollows");
    return sig;
  }

  /** Check if current user follows a target user */
  async isFollowing(targetPubkey: PublicKey): Promise<boolean> {
    const user = this.provider.wallet.publicKey;
    const [followPda] = getFollowPda(user, targetPubkey);
    try {
      await this.accounts.followAccount.fetch(followPda);
      return true;
    } catch {
      return false;
    }
  }

  /** Get all follow accounts (for building follower/following lists) */
  async getAllFollows(): Promise<{ follower: string; following: string }[]> {
    const cacheKey = "allFollows";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const all = await this.accounts.followAccount.all();
      const result = all.map((f: any) => ({
        follower: f.account.follower.toBase58(),
        following: f.account.following.toBase58(),
      }));
      rpcCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error("getAllFollows error:", err);
      return [];
    }
  }

  /** Get list of pubkeys that a user is following */
  async getFollowing(userPubkey: PublicKey): Promise<string[]> {
    const all = await this.getAllFollows();
    const addr = userPubkey.toBase58();
    return all.filter((f) => f.follower === addr).map((f) => f.following);
  }

  /** Get list of pubkeys that follow a user */
  async getFollowers(userPubkey: PublicKey): Promise<string[]> {
    const all = await this.getAllFollows();
    const addr = userPubkey.toBase58();
    return all.filter((f) => f.following === addr).map((f) => f.follower);
  }

  /** Search all profiles by username (partial match) */
  async searchByUsername(query: string): Promise<{ owner: string; username: string; displayName: string }[]> {
    const profiles = await this.getAllProfiles();
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return profiles
      .filter((p: any) => p.username?.toLowerCase().includes(q) || p.displayName?.toLowerCase().includes(q))
      .map((p: any) => ({
        owner: p.owner,
        username: p.username || "",
        displayName: p.displayName || "",
      }))
      .slice(0, 10); // max 10 results
  }

  // ========== COMMUNITIES ==========

  async createCommunity(communityId: number, name: string, description: string, avatarUrl: string): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [communityPda] = getCommunityPda(communityId);
    const [creatorProfilePda] = getProfilePda(user);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .createCommunity(new BN(communityId), name, description, compressIpfsUrl(avatarUrl))
      .accounts({
        community: communityPda,
        creatorProfile: creatorProfilePda,
        user,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user.toBase58());
    rpcCache.invalidate("allCommunities");
    return sig;
  }

  async joinCommunity(communityId: number): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [communityPda] = getCommunityPda(communityId);
    const [memberProfilePda] = getProfilePda(user);
    const [membershipPda] = getMembershipPda(communityPda, user);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .joinCommunity(new BN(communityId))
      .accounts({
        membership: membershipPda,
        community: communityPda,
        memberProfile: memberProfilePda,
        user,
        payer: treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user.toBase58());
    rpcCache.invalidate("allCommunities");
    rpcCache.invalidate("allMemberships");
    return sig;
  }

  async leaveCommunity(communityId: number): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [communityPda] = getCommunityPda(communityId);
    const [memberProfilePda] = getProfilePda(user);
    const [membershipPda] = getMembershipPda(communityPda, user);
    const treasury = await getTreasuryPubkey();

    const ix = await this.program.methods
      .leaveCommunity(new BN(communityId))
      .accounts({
        membership: membershipPda,
        community: communityPda,
        memberProfile: memberProfilePda,
        user,
        treasury,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, user.toBase58());
    rpcCache.invalidate("allCommunities");
    rpcCache.invalidate("allMemberships");
    return sig;
  }

  async getAllCommunities(): Promise<any[]> {
    const cacheKey = "allCommunities";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;
    try {
      const all = await this.accounts.community.all();
      const result = all.map((a: any) => ({
        pubkey: a.publicKey.toBase58(),
        creator: a.account.creator.toBase58(),
        communityId: Number(a.account.communityId),
        name: a.account.name,
        description: a.account.description,
        avatarUrl: expandIpfsUrl(a.account.avatarUrl),
        memberCount: a.account.memberCount,
        createdAt: Number(a.account.createdAt) * 1000,
      }));
      rpcCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error("getAllCommunities error:", err);
      return [];
    }
  }

  async getAllMemberships(): Promise<any[]> {
    const cacheKey = "allMemberships";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;
    try {
      const all = await this.accounts.membership.all();
      const result = all.map((a: any) => ({
        community: a.account.community.toBase58(),
        member: a.account.member.toBase58(),
        joinedAt: Number(a.account.joinedAt) * 1000,
      }));
      rpcCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error("getAllMemberships error:", err);
      return [];
    }
  }

  async isMember(communityId: number, userPubkey?: PublicKey): Promise<boolean> {
    const user = userPubkey || this.provider.wallet.publicKey;
    const [communityPda] = getCommunityPda(communityId);
    const [membershipPda] = getMembershipPda(communityPda, user);
    try {
      await this.accounts.membership.fetch(membershipPda);
      return true;
    } catch {
      return false;
    }
  }
}

/** Derive a deterministic chat ID from two public keys.
 *  Sorts the keys lexicographically so both users derive the same ID. */
export function deriveChatId(user1: PublicKey, user2: PublicKey): number {
  const sorted = [user1.toBase58(), user2.toBase58()].sort();
  // Hash the sorted pair into a u32-safe number (fits in BN / u64)
  let hash = 0;
  const str = sorted[0] + sorted[1];
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  // Make sure it's positive
  return Math.abs(hash);
}

// Export PDA helpers for use in components
export {
  getProfilePda,
  getPostPda,
  getChatPda,
  getMessagePda,
  getFollowPda,
  getCommunityPda,
  getMembershipPda,
  toLEBytes,
  PROGRAM_ID,
};

// Re-export encryption utilities for use in components
export {
  encryptMessage as naclEncryptMessage,
  decryptMessage as naclDecryptMessage,
  formatPubkeyMessage,
  parsePubkeyMessage,
  isEncryptedMessage,
  isPubkeyMessage,
} from "./encryption";
export { deriveEncryptionKeypair } from "./encryption";
