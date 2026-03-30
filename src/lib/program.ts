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

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
// Keep DELEGATION_PROGRAM_ID to skip orphaned delegated accounts
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

const PROFILE_SEED = Buffer.from("profile");
const POST_SEED = Buffer.from("post");
const CHAT_SEED = Buffer.from("chat");
const MESSAGE_SEED = Buffer.from("message");
const FOLLOW_SEED = Buffer.from("follow");
const COMMENT_SEED = Buffer.from("comment");
const REACTION_SEED = Buffer.from("reaction");
const CONVERSATION_SEED = Buffer.from("conversation");

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
  if (!data.success) throw new Error(data.error || "Sponsor transaction failed");
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



function getConversationPda(user1: PublicKey, user2: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONVERSATION_SEED, user1.toBuffer(), user2.toBuffer()],
    PROGRAM_ID
  );
}

/** Delegation record PDA — used only for detecting orphaned delegated accounts */
function getDelegationRecordPda(pda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), pda.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
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

  async createProfile(username: string, displayName: string, bio: string): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);

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
      return await this.accounts.profile.fetch(profilePda);
    } catch (err: any) {
      // Check if account exists but can't be deserialized (size mismatch or delegated)
      try {
        const acctInfo = await this.provider.connection.getAccountInfo(profilePda);
        if (acctInfo && acctInfo.data.length > 0) {
          // If account is delegated (orphaned), skip it — treat as no profile
          // Delegated accounts are stale after a nuke/cleanup
          if (acctInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
            console.log("🔗 Profile owned by delegation program — treating as no profile (stale delegation)");
            return null;
          }
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

  // updateProfilePrivacy is no longer used (was delegation-based)
  // Kept as a stub in case we re-add visibility controls later
  async updateProfilePrivacy(_isPrivate: boolean): Promise<string> {
    console.warn("updateProfilePrivacy is deprecated — delegation removed");
    return "deprecated";
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

    const ix = await this.program.methods
      .updateProfile(displayName, bio, avatarUrl, bannerUrl)
      .accounts({
        profile: profilePda,
        user,
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
          sessionToken: null as any,
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

  /** Fetch ALL posts — both regular (owned by our program) and delegated (owned by delegation program).
   *  Delegated posts are decoded manually since Anchor's post.all() only returns our-program-owned accounts. */
  async getAllPostsIncludingDelegated(): Promise<{ publicKey: string; author: string; postId: string; content: string; isPrivate: boolean; likes: string; commentCount: string; createdAt: string; isDelegated: boolean }[]> {
    const cacheKey = "allPostsDelegated";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    const coder = new BorshCoder(idl as Idl);

    // 1. Fetch regular (non-delegated) posts via Anchor (camelCase fields)
    const regularPosts = await this.accounts.post.all();
    const mapped: any[] = regularPosts.map((p: any) => ({
      publicKey: p.publicKey.toBase58(),
      author: p.account.author.toBase58(),
      postId: p.account.postId?.toString() || "0",
      content: p.account.content || "",
      isPrivate: p.account.isPrivate,
      likes: p.account.likes?.toString() || "0",
      commentCount: p.account.commentCount?.toString() || "0",
      createdAt: p.account.createdAt?.toString() || "0",
      isDelegated: false,
    }));

    // 2. Fetch delegated accounts (shared cache — used by messages too)
    const delegatedAccounts = await this._getDelegatedAccounts();

    for (const acc of delegatedAccounts) {
      try {
        // BorshCoder.accounts.decode uses capitalized name and returns snake_case fields
        const decoded = coder.accounts.decode("Post", acc.account.data);
        mapped.push({
          publicKey: acc.pubkey.toBase58(),
          author: decoded.author.toBase58(),
          postId: decoded.post_id?.toString() || "0",
          content: decoded.content || "",
          isPrivate: decoded.is_private,
          likes: decoded.likes?.toString() || "0",
          commentCount: decoded.comment_count?.toString() || "0",
          createdAt: decoded.created_at?.toString() || "0",
          isDelegated: true,
        });
      } catch {
        // Not a post account — skip (delegation program owns many account types)
      }
    }

    // Deduplicate by publicKey (in case an account was just undelegated)
    const seen = new Set<string>();
    const unique = mapped.filter((p: any) => {
      if (seen.has(p.publicKey)) return false;
      seen.add(p.publicKey);
      return true;
    });

    rpcCache.set(cacheKey, unique);
    return unique;
  }

  /** Shared helper: fetch delegated accounts (disabled — orphaned accounts cleaned up) */
  private async _getDelegatedAccounts(): Promise<readonly { pubkey: PublicKey; account: { data: Buffer } }[]> {
    return [];
  }

  async getAllProfiles(): Promise<any[]> {
    const cacheKey = "allProfiles";
    const cached = rpcCache.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch non-delegated profiles from main chain
      let result: any[] = [];
      try {
        const allProfiles = await this.accounts.profile.all();
        result = allProfiles.map((p: any) => ({
          publicKey: p.publicKey.toBase58(),
          ...p.account,
          owner: p.account.owner.toBase58(),
        }));
      } catch {
        console.warn("⚠️ getAllProfiles via Anchor failed, using raw fetch");
      }

      // Also check for delegated profiles (owned by delegation program)
      try {
        const delegatedAccounts = await this.provider.connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
          filters: [{ dataSize: 315 }], // Profile account size (8 disc + 307 LEN)
        });
        const knownOwners = new Set(result.map(p => p.owner));
        for (const acct of delegatedAccounts) {
          try {
            const decoded = this.program.coder.accounts.decode("profile", acct.account.data);
            const ownerStr = decoded.owner.toBase58();
            if (!knownOwners.has(ownerStr)) {
              result.push({
                publicKey: acct.pubkey.toBase58(),
                ...decoded,
                owner: ownerStr,
              });
              knownOwners.add(ownerStr);
            }
          } catch {
            // Not a profile account — skip
          }
        }
      } catch (erErr) {
        console.warn("⚠️ Failed to fetch delegated profiles:", (erErr as any)?.message?.slice(0, 60));
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
        sessionToken: null as any,
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
        sessionToken: null as any,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = treasury;
    tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
    const signed = await this.provider.wallet.signTransaction(tx);
    const sig = await sponsorTransaction(signed, wallet.toBase58());

    rpcCache.invalidate("allComments");
    rpcCache.invalidate("allPostsDelegated");
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
        sessionToken: null as any,
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

    // Safety check: if chat PDA was delegated from a previous session, bail out so caller can retry
    const chatAccInfo = await this.provider.connection.getAccountInfo(chatPda);
    if (chatAccInfo && chatAccInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      console.warn("⚠️  Chat PDA is delegated — caller should create a fresh chat.");
      throw new Error("Chat is delegated (stale). Create a new chat.");
    }

    // Step 1: Send the message on-chain (treasury-sponsored)
    const treasury = await getTreasuryPubkey();
    const ix = await this.program.methods
      .sendMessage(new BN(chatId), new BN(messageIndex), content, isPayment, new BN(paymentAmount))
      .accounts({
        message: messagePda,
        chat: chatPda,
        sender,
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

  /** Fetch all chats involving the current user.
   *  Instead of scanning the entire delegation program (100K+ accounts),
   *  we check each friend's expected chat PDA directly. */
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
        isDelegated: false,
      }))
      .filter((c: any) => c.user1 === userStr || c.user2 === userStr);

    // 2. For each friend, check if their chat PDA exists as a delegated account
    for (const friend of friendPubkeys) {
      const chatId = deriveChatId(user, friend);
      const [chatPda] = getChatPda(chatId);
      const chatPdaStr = chatPda.toBase58();

      // Skip if already found in regular chats
      if (mapped.find(c => c.publicKey === chatPdaStr)) continue;

      try {
        const accInfo = await this.provider.connection.getAccountInfo(chatPda);
        if (accInfo && accInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
          // This chat was delegated (orphaned) — decode it
          try {
            const decoded = coder.accounts.decode("Chat", accInfo.data);
            mapped.push({
              publicKey: chatPdaStr,
              chatId: decoded.chat_id?.toString() || chatId.toString(),
              user1: decoded.user1?.toBase58() || userStr,
              user2: decoded.user2?.toBase58() || friend.toBase58(),
              messageCount: Number(decoded.message_count || 0),
              createdAt: decoded.created_at?.toString() || "0",
              isDelegated: true,
            });
          } catch {
            // Decode failed
          }
        }
      } catch {
        // Account doesn't exist
      }
    }

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

  /** Fetch all messages for a specific chat (both regular and delegated). */
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

    // 2. Delegated messages — decode as Message and filter by chatId
    const delegatedAccounts = await this._getDelegatedAccounts();
    for (const acc of delegatedAccounts) {
      try {
        const decoded = coder.accounts.decode("Message", acc.account.data);
        const msgChatId = decoded.chat_id?.toString() || "0";
        if (msgChatId === chatIdStr) {
          mapped.push({
            publicKey: acc.pubkey.toBase58(),
            chatId: msgChatId,
            messageIndex: Number(decoded.message_index || 0),
            sender: decoded.sender?.toBase58() || "",
            content: decoded.content || "",
            isPayment: decoded.is_payment || false,
            paymentAmount: Number(decoded.payment_amount || 0),
            timestamp: decoded.timestamp?.toString() || "0",
            isDelegated: true,
          });
        }
      } catch {
        // Not a Message account (could be Post)
      }
    }

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
        isDelegated: false,
      }));
      rpcCache.set(cacheKey, mapped);
      return mapped;
    } catch {
      return [];
    }
  }

  /** Fetch all payment messages across all chats involving the current user.
   *  Uses cached message and delegated account data to minimize RPC calls. */
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
        isDelegated: false,
      });
    }

    // 3. Scan delegated messages for payment messages in user's chats
    const delegatedAccounts = await this._getDelegatedAccounts();
    for (const acc of delegatedAccounts) {
      try {
        const decoded = coder.accounts.decode("Message", acc.account.data);
        const chatId = decoded.chat_id?.toString() || "0";
        if (!userChatIds.has(chatId)) continue;
        if (!decoded.is_payment) continue;

        const pubkey = acc.pubkey.toBase58();
        // Skip if already found in regular
        if (payments.find(p => p.id === pubkey)) continue;

        const sender = decoded.sender?.toBase58() || "";
        const isSent = sender === userStr;

        payments.push({
          id: pubkey,
          sender: isSent ? "me" : sender,
          recipient: isSent ? (chatParticipant[chatId] || "") : "me",
          amount: Number(decoded.payment_amount || 0) / 1_000_000,
          token: "SOL",
          status: "completed" as const,
          isPrivate: true,
          timestamp: Number(decoded.timestamp?.toString() || "0") * 1000,
          content: decoded.content || "",
          isDelegated: true,
        });
      } catch {
        // Not a Message account
      }
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
   * Send a message on-chain (simple version, no delegation).
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
  getDelegationRecordPda,
  getConversationPda,
  toLEBytes,
  PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
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
