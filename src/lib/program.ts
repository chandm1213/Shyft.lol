import { Program, AnchorProvider, Idl, BN, BorshCoder } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Keypair, Transaction } from "@solana/web3.js";
import idl from "./idl.json";
import {
  encryptMessage as naclEncrypt,
  decryptMessage as naclDecrypt,
  formatPubkeyMessage,
  parsePubkeyMessage,
  isEncryptedMessage,
  isPubkeyMessage,
} from "./encryption";

/** Optional session key info for signing without wallet popup */
export interface SessionOpts {
  /** Ephemeral keypair that signs the transaction */
  sessionKeypair: Keypair;
  /** SessionToken PDA (on the session-keys program) */
  sessionTokenPda: PublicKey;
  /** The real wallet pubkey (authority) — needed for PDA derivation */
  authority: PublicKey;
}

const PROGRAM_ID = new PublicKey("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");
const PERMISSION_PROGRAM_ID = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const TEE_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
const MAGIC_VAULT = new PublicKey("MagicVau1t999999999999999999999999999999999");

/** MagicBlock Ephemeral Rollup RPC endpoint */
const ER_RPC_URL = "https://devnet.magicblock.app";

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

/** Permission PDA — derived by the Permission Program
 *  Seeds: ["permission:", permissioned_account] per MagicBlock SDK v0.8.0 */
function getPermissionPda(permissionedAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("permission:"), permissionedAccount.toBuffer()],
    PERMISSION_PROGRAM_ID
  );
}

/** Delegation buffer PDA — derived by the OWNER program (our program), NOT delegation program */
function getDelegationBufferPda(pda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), pda.toBuffer()],
    PROGRAM_ID
  );
}

/** Delegation record PDA — derived by the Delegation Program */
function getDelegationRecordPda(pda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), pda.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/** Delegation metadata PDA — derived by the Delegation Program */
function getDelegationMetadataPda(pda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), pda.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

export class ShyftClient {
  program: Program;
  provider: AnchorProvider;
  /** Program instance connected to MagicBlock Ephemeral Rollup */
  erProgram: Program;
  erConnection: Connection;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.program = new Program(idl as Idl, provider);
    // Create a second Program instance pointing at the ER RPC
    this.erConnection = new Connection(ER_RPC_URL, "confirmed");
    const erProvider = new AnchorProvider(
      this.erConnection,
      provider.wallet,
      { commitment: "confirmed" }
    );
    this.erProgram = new Program(idl as Idl, erProvider);
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

    const sig = await this.program.methods
      .createProfile(username, displayName, bio)
      .accounts({
        profile: profilePda,
        user,
        payer: user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return sig;
  }

  async migrateProfile(): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const sig = await this.program.methods
      .migrateProfile()
      .accounts({
        profile: profilePda,
        user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
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
          // If account is delegated to MagicBlock, fetch from ER instead
          if (acctInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
            console.log("🔗 Profile delegated to ER — fetching from MagicBlock...");
            try {
              const erAccount = await (this.erProgram.account as any).profile.fetch(profilePda);
              return erAccount;
            } catch {
              console.warn("⚠️ Failed to fetch delegated profile from ER");
            }
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

  async updateProfilePrivacy(isPrivate: boolean): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const [permissionPda] = getPermissionPda(profilePda);

    const sig = await this.program.methods
      .updateProfilePrivacy(isPrivate)
      .accounts({
        profile: profilePda,
        user,
        permission: permissionPda,
        permissionProgram: PERMISSION_PROGRAM_ID,
      })
      .rpc();
    return sig;
  }

  async updateProfile(displayName: string, bio: string, avatarUrl: string, bannerUrl: string): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);

    const sig = await this.program.methods
      .updateProfile(displayName, bio, avatarUrl, bannerUrl)
      .accounts({
        profile: profilePda,
        user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    rpcCache.invalidate("profile_" + user.toBase58());
    return sig;
  }

  // ========== POSTS ==========

  async createPost(postId: number, content: string, isPrivate: boolean, session?: SessionOpts): Promise<string> {
    const realWallet = session?.authority ?? this.provider.wallet.publicKey;
    if (!realWallet) {
      throw new Error("Wallet not connected - no public key available");
    }

    console.log("=== Creating Post ===");
    console.log("Author (real wallet):", realWallet.toBase58());
    console.log("Post ID:", postId);
    console.log("Using session key:", !!session);

    // If profile is still delegated to ER, undelegate first so we can use it
    try {
      const delegated = await this.isProfileDelegated();
      if (delegated) {
        console.log("⚠️ Profile delegated — undelegating before post...");
        await this.undelegateProfile();
        // Wait for undelegation to propagate
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e: any) {
      console.warn("Undelegate check/attempt failed:", e?.message?.slice(0, 80));
    }

    try {
      if (session) {
        // Session key flow — ephemeral key signs, no wallet popup
        const [profilePda] = getProfilePda(realWallet);
        const [postPda] = getPostPda(realWallet, postId);

        const ix = await this.program.methods
          .createPost(new BN(postId), content, isPrivate)
          .accountsPartial({
            post: postPda,
            profile: profilePda,
            author: session.sessionKeypair.publicKey,
            payer: session.sessionKeypair.publicKey,
            systemProgram: SystemProgram.programId,
            sessionToken: session.sessionTokenPda,
          })
          .instruction();

        const tx = new Transaction().add(ix);
        tx.feePayer = session.sessionKeypair.publicKey;
        tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
        tx.sign(session.sessionKeypair);

        const sig = await this.provider.connection.sendRawTransaction(tx.serialize());
        await this.provider.connection.confirmTransaction(sig, "confirmed");

        console.log("Post created (session key):", sig);
        rpcCache.invalidate("allPosts");
        return sig;
      } else {
        // Normal wallet flow — still need to pass profile PDA (IDL requires it)
        const [profilePda] = getProfilePda(realWallet);
        const sig = await this.program.methods
          .createPost(new BN(postId), content, isPrivate)
          .accountsPartial({
            profile: profilePda,
            author: realWallet,
            payer: realWallet,
            systemProgram: SystemProgram.programId,
            sessionToken: null as any,
          })
          .rpc();

        console.log("Post created successfully:", sig);
        rpcCache.invalidate("allPosts");
        return sig;
      }
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

  /** Shared helper: fetch all delegated post/message accounts.
   *  Fetches both 589-byte (old posts + messages) and 357-byte (new posts) accounts.
   *  Cached for 10s to avoid redundant getProgramAccounts calls. */
  private async _getDelegatedAccounts(): Promise<readonly { pubkey: PublicKey; account: { data: Buffer } }[]> {
    const cacheKey = "delegatedAccounts";
    const cached = rpcCache.get<readonly { pubkey: PublicKey; account: { data: Buffer } }[]>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch both old-size (589 = Message or old Post) and new-size (357 = new Post) in parallel
      const [old589, new357] = await Promise.all([
        this.provider.connection.getProgramAccounts(
          DELEGATION_PROGRAM_ID,
          { filters: [{ dataSize: 589 }] }
        ),
        this.provider.connection.getProgramAccounts(
          DELEGATION_PROGRAM_ID,
          { filters: [{ dataSize: 357 }] }
        ),
      ]);
      const all = [...old589, ...new357];
      console.log(`Found ${old589.length} delegated (589b) + ${new357.length} delegated (357b) = ${all.length} total`);
      rpcCache.set(cacheKey, all);
      return all;
    } catch (err) {
      console.error("Failed to fetch delegated accounts:", err);
      return [];
    }
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

  async likePost(author: PublicKey, postId: number, session?: SessionOpts): Promise<string> {
    const [postPda] = getPostPda(author, postId);
    const realWallet = session?.authority ?? this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(realWallet);

    if (session) {
      const ix = await this.program.methods
        .likePost(new BN(postId))
        .accountsPartial({
          post: postPda,
          profile: profilePda,
          user: session.sessionKeypair.publicKey,
          sessionToken: session.sessionTokenPda,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = session.sessionKeypair.publicKey;
      tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      tx.sign(session.sessionKeypair);

      const sig = await this.provider.connection.sendRawTransaction(tx.serialize());
      await this.provider.connection.confirmTransaction(sig, "confirmed");
      return sig;
    }

    const sig = await this.program.methods
      .likePost(new BN(postId))
      .accountsPartial({
        post: postPda,
        profile: profilePda,
        user: this.provider.wallet.publicKey,
        sessionToken: null as any,
      })
      .rpc();
    return sig;
  }

  // ========== COMMENTS ==========

  async createComment(author: PublicKey, postId: number, commentIndex: number, content: string, session?: SessionOpts): Promise<string> {
    const [postPda] = getPostPda(author, postId);
    const [commentPda] = getCommentPda(postPda, commentIndex);
    const realWallet = session?.authority ?? this.provider.wallet.publicKey;
    const [commenterProfilePda] = getProfilePda(realWallet);

    if (session) {
      const ix = await this.program.methods
        .createComment(new BN(postId), new BN(commentIndex), content)
        .accountsPartial({
          comment: commentPda,
          post: postPda,
          commenterProfile: commenterProfilePda,
          author: session.sessionKeypair.publicKey,
          payer: session.sessionKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          sessionToken: session.sessionTokenPda,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = session.sessionKeypair.publicKey;
      tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      tx.sign(session.sessionKeypair);

      const sig = await this.provider.connection.sendRawTransaction(tx.serialize());
      await this.provider.connection.confirmTransaction(sig, "confirmed");

      rpcCache.invalidate("allComments");
      rpcCache.invalidate("allPostsDelegated");
      return sig;
    }

    const sig = await this.program.methods
      .createComment(new BN(postId), new BN(commentIndex), content)
      .accountsPartial({
        comment: commentPda,
        post: postPda,
        commenterProfile: commenterProfilePda,
        author: this.provider.wallet.publicKey,
        payer: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        sessionToken: null as any,
      })
      .rpc();

    // Invalidate caches so new comments show up
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

  async reactToPost(author: PublicKey, postId: number, reactionType: number, session?: SessionOpts): Promise<string> {
    const realWallet = session?.authority ?? this.provider.wallet.publicKey;
    const [postPda] = getPostPda(author, postId);
    // Reaction PDA now uses the real wallet (profile.owner), not the signer
    const [reactionPda] = getReactionPda(postPda, realWallet);
    const [reactorProfilePda] = getProfilePda(realWallet);

    if (session) {
      const ix = await this.program.methods
        .reactToPost(new BN(postId), reactionType)
        .accountsPartial({
          reaction: reactionPda,
          post: postPda,
          reactorProfile: reactorProfilePda,
          user: session.sessionKeypair.publicKey,
          payer: session.sessionKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          sessionToken: session.sessionTokenPda,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = session.sessionKeypair.publicKey;
      tx.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      tx.sign(session.sessionKeypair);

      const sig = await this.provider.connection.sendRawTransaction(tx.serialize());
      await this.provider.connection.confirmTransaction(sig, "confirmed");

      rpcCache.invalidate("allReactions");
      return sig;
    }

    const sig = await this.program.methods
      .reactToPost(new BN(postId), reactionType)
      .accountsPartial({
        reaction: reactionPda,
        post: postPda,
        reactorProfile: reactorProfilePda,
        user: this.provider.wallet.publicKey,
        payer: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        sessionToken: null as any,
      })
      .rpc();

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

    const sig = await this.program.methods
      .createChat(new BN(chatId))
      .accounts({
        chat: chatPda,
        user1,
        user2,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
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
      throw new Error("Chat is delegated to TEE. Create a new chat.");
    }

    // Step 1: Send the message on-chain
    const sig = await this.program.methods
      .sendMessage(new BN(chatId), new BN(messageIndex), content, isPayment, new BN(paymentAmount))
      .accounts({
        message: messagePda,
        chat: chatPda,
        sender,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Message sent on-chain:", sig);

    // Invalidate message caches after sending
    rpcCache.invalidate("messages:");
    rpcCache.invalidate("allMessages");

    // Step 2: Create MagicBlock permission on the message PDA
    // Get the other participant from the chat
    try {
      const chatData = await this.accounts.chat.fetch(chatPda);
      const user1 = chatData.user1 as PublicKey;
      const user2 = chatData.user2 as PublicKey;
      const members = [
        { flags: 7, pubkey: user1 },
        { flags: 7, pubkey: user2 },
      ];
      const accountType = { message: { chatId: new BN(chatId), messageIndex: new BN(messageIndex) } };

      const permSig = await this.createPermission(accountType, messagePda, members);
      console.log("✅ MagicBlock permission created for message:", permSig);

      // Step 3: Delegate the message PDA to TEE
      const delSig = await this.delegateAccount(accountType, messagePda);
      console.log("✅ Message delegated to MagicBlock TEE:", delSig);
    } catch (err: any) {
      // Permission/delegation is best-effort — message is already on-chain
      console.warn("⚠️ MagicBlock delegation for message failed (msg still sent):", err?.message?.slice(0, 100));
    }

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
          // This chat was delegated to TEE — decode it
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

  /** Create a private chat with MagicBlock TEE delegation */
  async createPrivateChatFull(
    chatId: number,
    user2: PublicKey
  ): Promise<{ createSig: string; permissionSig?: string; delegateSig?: string }> {
    const user1 = this.provider.wallet.publicKey;
    if (!user1) throw new Error("Wallet not connected");

    console.log("🔐 === Creating Private Chat with MagicBlock ===");
    console.log("Chat ID:", chatId, "Between:", user1.toBase58().slice(0, 8), "and", user2.toBase58().slice(0, 8));

    // Step 1: Create chat on-chain
    console.log("📝 Step 1: Creating chat...");
    const createSig = await this.createChat(chatId, user2);
    console.log("✅ Chat created:", createSig);

    // Step 2: Create permission (restrict to the 2 participants)
    let permissionSig: string | undefined;
    const [chatPda] = getChatPda(chatId);
    const members = [
      { flags: 7, pubkey: user1 }, // AUTHORITY + TX_LOGS + TX_BALANCES
      { flags: 7, pubkey: user2 }, // Both have full access
    ];
    const accountType = { chat: { chatId: new BN(chatId) } };

    try {
      console.log("🔒 Step 2: Creating MagicBlock permission...");
      permissionSig = await this.createPermission(accountType, chatPda, members);
      console.log("✅ Permission created:", permissionSig);
    } catch (err: any) {
      console.warn("⚠️  Permission failed:", err?.message?.slice(0, 100));
    }

    // Note: We do NOT delegate the chat PDA itself to TEE.
    // The chat PDA must stay writable on devnet so sendMessage can increment message_count.
    // Instead, individual message PDAs are delegated to TEE after sending (see sendMessage).
    // The permission on the chat PDA still restricts access to the two participants.

    return { createSig, permissionSig, delegateSig: undefined };
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
   * Send a message on-chain WITHOUT MagicBlock delegation (simpler, cheaper).
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

    const sig = await this.program.methods
      .sendMessage(new BN(chatId), new BN(messageIndex), content, isPayment, new BN(paymentAmount))
      .accounts({
        message: messagePda,
        chat: chatPda,
        sender,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

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
   * Scans messages for PUBKEY: prefixed content from someone other than `myAddress`.
   */
  async findPeerEncryptionKey(chatId: number, myAddress: string): Promise<Uint8Array | null> {
    const messages = await this.getMessagesForChat(chatId);
    for (const msg of messages) {
      if (msg.sender === myAddress) continue;
      if (isPubkeyMessage(msg.content)) {
        const key = parsePubkeyMessage(msg.content);
        if (key && key.length === 32) return key;
      }
    }
    return null;
  }

  /**
   * Find MY encryption public key in a chat (to check if already published).
   */
  async findMyEncryptionKey(chatId: number, myAddress: string): Promise<boolean> {
    const messages = await this.getMessagesForChat(chatId);
    for (const msg of messages) {
      if (msg.sender === myAddress && isPubkeyMessage(msg.content)) {
        return true;
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

      let decrypted: string | null = null;
      if (isEnc) {
        // For encrypted messages, the "sender" used the sender's secret key + recipient's public key
        // So to decrypt: we need the sender's PUBLIC key + our SECRET key
        if (isMe) {
          // We sent this — we can't decrypt our own outgoing messages with naclDecrypt
          // because we encrypted with (ourSecret, theirPublic) but to decrypt
          // we'd need (ourPublic, ourSecret) which isn't how NaCl box works.
          // Instead re-derive: we encrypted with our secret + their public,
          // so we decrypt with their public + our secret (same operation!)
          decrypted = naclDecrypt(msg.content, peerPublicKey, mySecretKey);
        } else {
          // They sent this — encrypted with their secret + our public
          // We decrypt with their public + our secret
          decrypted = naclDecrypt(msg.content, peerPublicKey, mySecretKey);
        }
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
        isEncrypted: isEnc,
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
        // Publish our key
        const chat = existing;
        const msgIndex = Number(chat.messageCount || 0);
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

    const sig = await this.program.methods
      .followUser()
      .accounts({
        followAccount: followPda,
        followerProfile: followerProfilePda,
        followingProfile: followingProfilePda,
        user,
        payer: user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    rpcCache.invalidate("allFollows");
    return sig;
  }

  async unfollowUser(targetPubkey: PublicKey): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [followerProfilePda] = getProfilePda(user);
    const [followingProfilePda] = getProfilePda(targetPubkey);
    const [followPda] = getFollowPda(user, targetPubkey);

    const sig = await this.program.methods
      .unfollowUser()
      .accounts({
        followAccount: followPda,
        followerProfile: followerProfilePda,
        followingProfile: followingProfilePda,
        user,
      })
      .rpc();
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

  // ========== DELEGATION & PERMISSIONS ==========

  async delegateAccount(accountType: any, pda: PublicKey): Promise<string> {
    const [bufferPda] = getDelegationBufferPda(pda);
    const [delegationRecordPda] = getDelegationRecordPda(pda);
    const [delegationMetadataPda] = getDelegationMetadataPda(pda);

    const sig = await this.program.methods
      .delegatePda(accountType)
      .accounts({
        bufferPda,
        delegationRecordPda,
        delegationMetadataPda,
        pda,
        payer: this.provider.wallet.publicKey,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false },
      ])
      .rpc();
    return sig;
  }

  async createPermission(accountType: any, pda: PublicKey, members: any[] | null): Promise<string> {
    // Permission PDA: seeds = ["permission:", permissioned_account] per MagicBlock SDK v0.8.0
    const [permissionPda] = getPermissionPda(pda);

    try {
      const sig = await this.program.methods
        .createPermission(accountType, members)
        .accounts({
          permissionedAccount: pda,
          permission: permissionPda,
          payer: this.provider.wallet.publicKey,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ Permission created:", sig);
      return sig;
    } catch (err: any) {
      console.error("❌ Permission creation failed:", err.message?.slice(0, 200));
      throw err;
    }
  }

  async undelegate(account: PublicKey): Promise<string> {
    const sig = await this.program.methods
      .undelegate()
      .accounts({
        payer: this.provider.wallet.publicKey,
        account,
        magicProgram: MAGIC_PROGRAM,
        magicContext: MAGIC_CONTEXT,
      })
      .rpc();
    return sig;
  }

  async processUndelegation(
    baseAccount: PublicKey,
    buffer: PublicKey,
    accountSeeds: Buffer[]
  ): Promise<string> {
    const sig = await this.program.methods
      .processUndelegation(accountSeeds)
      .accounts({
        baseAccount,
        buffer,
        payer: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return sig;
  }

  // ========== EPHEMERAL CONVERSATIONS (MagicBlock ER) ==========

  /** Top up profile PDA with lamports to sponsor ephemeral conversations */
  async topUpProfile(lamports: number): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const sig = await this.program.methods
      .topUpProfile(new BN(lamports))
      .accounts({
        profile: profilePda,
        user,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return sig;
  }

  /** Delegate user's profile PDA to the MagicBlock Ephemeral Rollup */
  async delegateProfile(): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const [bufferPda] = getDelegationBufferPda(profilePda);
    const [delegationRecordPda] = getDelegationRecordPda(profilePda);
    const [delegationMetadataPda] = getDelegationMetadataPda(profilePda);

    const sig = await this.program.methods
      .delegateProfile(null)
      .accounts({
        user,
        profile: profilePda,
        bufferPda,
        delegationRecordPda,
        delegationMetadataPda,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Profile delegated to ER:", sig);
    return sig;
  }

  /** Get profile PDA lamport balance */
  async getProfileBalance(): Promise<number> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const info = await this.provider.connection.getAccountInfo(profilePda);
    return info?.lamports ?? 0;
  }

  /** Combined: top-up (if needed) + delegate in a SINGLE transaction = 1 wallet prompt */
  async topUpAndDelegateProfile(minLamports: number = 2_000_000): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const [bufferPda] = getDelegationBufferPda(profilePda);
    const [delegationRecordPda] = getDelegationRecordPda(profilePda);
    const [delegationMetadataPda] = getDelegationMetadataPda(profilePda);

    const tx = new Transaction();

    // Check if profile needs funding
    const balance = await this.getProfileBalance();
    if (balance < minLamports) {
      const needed = minLamports - balance;
      const topUpIx = await this.program.methods
        .topUpProfile(new BN(needed))
        .accounts({
          profile: profilePda,
          user,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      tx.add(topUpIx);
      console.log(`💰 Topping up profile with ${needed / 1e9} SOL (balance: ${balance / 1e9})`);
    } else {
      console.log(`💰 Profile already funded: ${balance / 1e9} SOL — skipping top-up`);
    }

    // Add delegate instruction
    const delegateIx = await this.program.methods
      .delegateProfile(null)
      .accounts({
        user,
        profile: profilePda,
        bufferPda,
        delegationRecordPda,
        delegationMetadataPda,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    tx.add(delegateIx);

    const sig = await this.provider.sendAndConfirm(tx);
    console.log("✅ Profile topped up & delegated in single TX:", sig);
    return sig;
  }

  /** Undelegate user's profile PDA back to Solana */
  async undelegateProfile(): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);

    const sig = await this.erProgram.methods
      .undelegateProfile()
      .accounts({
        user,
        profile: profilePda,
        magicContext: MAGIC_CONTEXT,
        magicProgram: MAGIC_PROGRAM,
      })
      .rpc({ skipPreflight: true });
    console.log("✅ Profile undelegated:", sig);
    return sig;
  }

  /** Create an ephemeral conversation in the ER.
   *  The caller's profile PDA must already be delegated to the ER. */
  async createConversation(otherUser: PublicKey, messageCapacity = 0): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profileOwnerPda] = getProfilePda(user);
    const [profileOtherPda] = getProfilePda(otherUser);
    const [conversationPda] = getConversationPda(user, otherUser);

    const sig = await this.erProgram.methods
      .createConversation(messageCapacity)
      .accounts({
        authority: user,
        profileOwner: profileOwnerPda,
        profileOther: profileOtherPda,
        conversation: conversationPda,
        vault: MAGIC_VAULT,
        magicProgram: MAGIC_PROGRAM,
      })
      .rpc({ skipPreflight: true });
    console.log(`✅ Ephemeral conversation created (capacity=${messageCapacity}):`, sig);
    return sig;
  }

  /** Extend an ephemeral conversation's capacity */
  async extendConversation(otherUser: PublicKey, additionalMessages: number): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profileSenderPda] = getProfilePda(user);
    const [profileOtherPda] = getProfilePda(otherUser);
    const [conversationPda] = getConversationPda(user, otherUser);

    const sig = await this.erProgram.methods
      .extendConversation(additionalMessages)
      .accounts({
        authority: user,
        profileSender: profileSenderPda,
        profileOther: profileOtherPda,
        conversation: conversationPda,
        vault: MAGIC_VAULT,
        magicProgram: MAGIC_PROGRAM,
      })
      .rpc({ skipPreflight: true });
    console.log("✅ Conversation extended:", sig);
    return sig;
  }

  /** Send a message in an ephemeral conversation (FREE — runs inside ER) */
  async appendMessage(otherUser: PublicKey, body: string): Promise<string> {
    const user = this.provider.wallet.publicKey;
    // Try both orderings of the conversation PDA
    // Min size for 1 message: 8 + 69 + 324 = 401 (280-char messages)
    const MIN_USABLE_SIZE = 401;
    let conversationPda: PublicKey | undefined;
    for (const [a, b] of [[user, otherUser], [otherUser, user]] as [PublicKey, PublicKey][]) {
      const [pda] = getConversationPda(a, b);
      try {
        const info = await this.erConnection.getAccountInfo(pda);
        if (info && info.data.length >= MIN_USABLE_SIZE) {
          conversationPda = pda;
          console.log("📍 Found conversation PDA:", pda.toBase58(), "size:", info.data.length);
          break;
        } else if (info && info.data.length > 0) {
          console.warn(`⚠️ Stale conversation at ${pda.toBase58()} — only ${info.data.length} bytes (need ${MIN_USABLE_SIZE}+)`);
        }
      } catch { /* try next ordering */ }
    }

    if (!conversationPda) {
      throw new Error("AccountNotFound: Ephemeral conversation does not exist on ER. It may have expired or is too small.");
    }

    try {
      const sig = await this.erProgram.methods
        .appendMessage(body)
        .accounts({
          sender: user,
          conversation: conversationPda,
        })
        .rpc({ skipPreflight: true });
      console.log("✅ Message appended:", sig);
      return sig;
    } catch (err: any) {
      // Extract full error details
      console.error("❌ appendMessage RPC error:", JSON.stringify({
        message: err?.message?.slice(0, 200),
        code: err?.code,
        errorCode: err?.error?.errorCode,
        errorMessage: err?.error?.errorMessage,
        logs: err?.logs || err?.error?.logs,
      }, null, 2));
      throw err;
    }
  }

  /** Close an ephemeral conversation — tries both PDA orderings to find the right one */
  async closeConversation(otherUser: PublicKey): Promise<string> {
    const user = this.provider.wallet.publicKey;
    const [profileOwnerPda] = getProfilePda(user);
    const [profileOtherPda] = getProfilePda(otherUser);
    const [conversationPda] = getConversationPda(user, otherUser);

    // Check if conversation exists at the primary ordering
    const info = await this.erConnection.getAccountInfo(conversationPda);
    if (info && info.data.length > 0) {
      const sig = await this.erProgram.methods
        .closeConversation()
        .accounts({
          authority: user,
          profileOwner: profileOwnerPda,
          profileOther: profileOtherPda,
          conversation: conversationPda,
          vault: MAGIC_VAULT,
          magicProgram: MAGIC_PROGRAM,
        })
        .rpc({ skipPreflight: true });
      console.log("✅ Conversation closed:", sig);
      return sig;
    }

    // Check reverse ordering — but on-chain the authority must match profileOwner,
    // so we still pass our profile as profileOwner. The seeds just derive differently.
    const [conversationPdaReverse] = getConversationPda(otherUser, user);
    const infoReverse = await this.erConnection.getAccountInfo(conversationPdaReverse);
    if (infoReverse && infoReverse.data.length > 0) {
      // The reverse conv was created by the other user. We can't close it (authority mismatch).
      // Just log a warning — we'll extend it instead.
      console.warn("⚠️ Conversation found at reverse PDA (created by other user) — cannot close, will extend instead");
      throw new Error("Cannot close conversation created by other user");
    }

    throw new Error("No conversation found to close");
  }

  /** Fetch conversation messages from the ER.
   *  Returns parsed messages array or empty if no conversation exists. */
  async getConversationMessages(user1: PublicKey, user2: PublicKey): Promise<{sender: string; body: string; timestamp: number}[]> {
    // Try both orderings
    for (const [a, b] of [[user1, user2], [user2, user1]]) {
      const [conversationPda] = getConversationPda(a, b);
      try {
        const account = await (this.erProgram.account as any).conversation.fetch(conversationPda);
        if (account) {
          const msgs = (account.messages as any[]) || [];
          return msgs.map((m: any) => ({
            sender: m.sender.toBase58(),
            body: m.body,
            timestamp: Number(m.timestamp || 0),
          }));
        }
      } catch {
        // Try other ordering
      }
    }
    return [];
  }

  /** Check if an ephemeral conversation with usable capacity exists */
  async conversationExists(user1: PublicKey, user2: PublicKey): Promise<boolean> {
    // Minimum size for at least 1 message: 8 (discriminator) + 69 (base) + 324 (1 msg) = 401
    const MIN_USABLE_SIZE = 401;
    for (const [a, b] of [[user1, user2], [user2, user1]]) {
      const [conversationPda] = getConversationPda(a, b);
      try {
        const info = await this.erConnection.getAccountInfo(conversationPda);
        if (info && info.data.length >= MIN_USABLE_SIZE) return true;
        if (info && info.data.length > 0) {
          console.warn(`⚠️ Stale conversation found (${info.data.length} bytes, need ${MIN_USABLE_SIZE}+)`);
        }
      } catch { /* skip */ }
    }
    return false;
  }

  /** Check if a stale (too-small) conversation exists that needs to be cleaned up */
  async findStaleConversation(user1: PublicKey, user2: PublicKey): Promise<PublicKey | null> {
    const MIN_USABLE_SIZE = 401;
    for (const [a, b] of [[user1, user2], [user2, user1]] as [PublicKey, PublicKey][]) {
      const [pda] = getConversationPda(a, b);
      try {
        const info = await this.erConnection.getAccountInfo(pda);
        if (info && info.data.length > 0 && info.data.length < MIN_USABLE_SIZE) {
          return pda;
        }
      } catch { /* skip */ }
    }
    return null;
  }

  /** Subscribe to real-time conversation updates via ER websocket */
  onConversationChange(
    user1: PublicKey,
    user2: PublicKey,
    callback: (messages: {sender: string; body: string; timestamp: number}[]) => void
  ): number | null {
    const coder = new BorshCoder(idl as Idl);
    // Try primary ordering first
    const [conversationPda] = getConversationPda(user1, user2);
    try {
      const subId = this.erConnection.onAccountChange(
        conversationPda,
        (accountInfo) => {
          try {
            const decoded = coder.accounts.decode("conversation", accountInfo.data);
            const msgs = (decoded.messages as any[]) || [];
            callback(msgs.map((m: any) => ({
              sender: m.sender.toBase58(),
              body: m.body,
              timestamp: Number(m.timestamp || 0),
            })));
          } catch {
            // Ignore decode failures — happens during initial account write
          }
        },
        "confirmed"
      );
      return subId;
    } catch {
      return null;
    }
  }

  /** Unsubscribe from conversation updates */
  removeConversationListener(subscriptionId: number): void {
    this.erConnection.removeAccountChangeListener(subscriptionId);
  }

  /** Check if the user's profile is currently delegated to the ER */
  async isProfileDelegated(): Promise<boolean> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    try {
      const info = await this.provider.connection.getAccountInfo(profilePda);
      if (!info) return false;
      return info.owner.equals(DELEGATION_PROGRAM_ID);
    } catch {
      return false;
    }
  }

  /** Poll the ER until the user's profile account is available there.
   *  This ensures the delegated account has been picked up by the ER
   *  before we try to create ephemeral conversations that depend on it. */
  async waitForProfileOnER(timeoutMs = 8000): Promise<void> {
    const user = this.provider.wallet.publicKey;
    const [profilePda] = getProfilePda(user);
    const start = Date.now();
    const interval = 1000;

    while (Date.now() - start < timeoutMs) {
      try {
        const info = await this.erConnection.getAccountInfo(profilePda);
        if (info && info.data.length > 0) {
          console.log("✅ Profile found on ER after", Date.now() - start, "ms");
          return;
        }
      } catch {
        // ER might not have it yet
      }
      await new Promise(r => setTimeout(r, interval));
    }
    console.warn("⚠️ Profile not found on ER after timeout — proceeding anyway");
  }

  // ========== HELPER: Full private chat flow ==========

  async createPrivateChat(
    chatId: number,
    user2: PublicKey
  ): Promise<{ createSig: string; permissionSig: string; delegateSig: string }> {
    const user1 = this.provider.wallet.publicKey;

    // 1. Create chat
    const createSig = await this.createChat(chatId, user2);

    // 2. Permission — only the 2 participants
    const [chatPda] = getChatPda(chatId);
    const members = [
      { flags: 7, pubkey: user1 },
      { flags: 7, pubkey: user2 },
    ];
    const accountType = { chat: { chatId: new BN(chatId) } };
    const permissionSig = await this.createPermission(accountType, chatPda, members);

    // 3. Delegate to TEE
    const delegateSig = await this.delegateAccount(accountType, chatPda);

    return { createSig, permissionSig, delegateSig };
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
  getPermissionPda,
  getDelegationBufferPda,
  getDelegationRecordPda,
  getDelegationMetadataPda,
  getConversationPda,
  toLEBytes,
  PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
  TEE_VALIDATOR,
  MAGIC_PROGRAM,
  MAGIC_CONTEXT,
  MAGIC_VAULT,
  ER_RPC_URL,
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
