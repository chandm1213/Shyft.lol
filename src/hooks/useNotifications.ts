"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAppStore, AppNotification } from "@/lib/store";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@/hooks/usePrivyWallet";
import { clearRpcCache } from "@/lib/program";
import { v4 as uuidv4 } from "uuid";

const POLL_INTERVAL = 5_000; // 5 seconds — near real-time
const REACTIONS_EMOJI = ["❤️", "🔥", "🚀", "😂", "👏", "💡"];

/**
 * Polls on-chain data and generates notifications for:
 * - New comments on your posts (from others)
 * - New likes on your posts (from others)
 * - New reactions on your posts (from others)
 * - New followers
 * - Reposts of your content (posts starting with RT|@you| or legacy format)
 *
 * Key behaviour:
 * - On first ever poll (seenNotificationKeys is empty), we seed ALL existing
 *   on-chain keys as "seen" WITHOUT creating notifications. This prevents a
 *   flood of historical notifications on first load / after cache clear.
 * - Once a notification is created & marked read, it is NEVER recreated
 *   because we check seenNotificationKeys (persisted in localStorage).
 * - Self-interactions are ALWAYS excluded.
 */
export function useNotifications() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const {
    seenNotificationKeys,
    addSeenNotificationKeys,
    addNotifications,
    currentUser,
    likedPosts,
  } = useAppStore();

  // Keep refs to avoid stale closures
  const seenRef = useRef(seenNotificationKeys);
  seenRef.current = seenNotificationKeys;
  const likedRef = useRef(likedPosts);
  likedRef.current = likedPosts;

  // Track whether we've done the initial seed (so first poll doesn't fire notifications)
  const initialSeedDone = useRef(false);

  // Track last known like counts per post to detect increments
  const lastLikeCounts = useRef<Record<string, number>>({});
  // Track if like counts were initialized (to avoid false positives on first poll)
  const likeCountsInitialized = useRef(false);

  // Track last known tip total to detect new incoming tips
  const lastTipTotal = useRef<number | null>(null);

  const poll = useCallback(async () => {
    if (!program || !publicKey) return;

    const myAddr = publicKey.toBase58();
    const seen = new Set(seenRef.current);
    const isFirstPoll = seen.size === 0 && !initialSeedDone.current;

    // Clear RPC cache so we get fresh on-chain data
    clearRpcCache();
    const newNotifications: AppNotification[] = [];
    const newSeenKeys: string[] = [];

    try {
      // Fetch all data in parallel
      const [posts, comments, reactions, profiles, follows] = await Promise.all([
        program.getAllPosts().catch(() => [] as any[]),
        program.getAllComments().catch(() => [] as any[]),
        program.getAllReactions().catch(() => [] as any[]),
        program.getAllProfiles().catch(() => [] as any[]),
        program.getFollowers(publicKey).catch(() => [] as string[]),
      ]);

      // Build profile lookup
      const profileMap: Record<string, any> = {};
      for (const p of profiles) profileMap[p.owner || p.publicKey] = p;

      const resolveActor = (addr: string) => {
        const p = profileMap[addr];
        if (p?.displayName && p.displayName !== "Anonymous") return p.displayName;
        if (p?.username && p.username !== "anon") return `@${p.username}`;
        return addr.slice(0, 4) + "..." + addr.slice(-4);
      };

      // My posts (to check for comments, likes, reactions on them)
      const myPosts = posts.filter((p: any) => p.author === myAddr);
      const myPostKeys = new Set(myPosts.map((p: any) => p.publicKey));

      // ─── Comments on my posts ───
      for (const c of comments) {
        if (!myPostKeys.has(c.post)) continue; // not on my post
        if (c.author === myAddr) continue; // my own comment
        const key = `comment:${c.publicKey}`;
        if (seen.has(key)) continue;
        newSeenKeys.push(key);
        // On first poll, only seed the key — don't create a notification
        if (isFirstPoll) continue;
        const post = myPosts.find((p: any) => p.publicKey === c.post);
        newNotifications.push({
          id: uuidv4(),
          type: "comment",
          actorAddress: c.author,
          actorName: resolveActor(c.author),
          postKey: c.post,
          postPreview: post?.content?.slice(0, 50) || "",
          commentText: c.content?.slice(0, 80) || "",
          timestamp: Number(c.createdAt) * 1000 || Date.now(),
          read: false,
        });
      }

      // ─── Reactions on my posts ───
      for (const r of reactions) {
        if (!myPostKeys.has(r.post)) continue;
        if (r.user === myAddr) continue;
        const key = `reaction:${r.publicKey}`;
        if (seen.has(key)) continue;
        newSeenKeys.push(key);
        if (isFirstPoll) continue;
        const post = myPosts.find((p: any) => p.publicKey === r.post);
        newNotifications.push({
          id: uuidv4(),
          type: "reaction",
          actorAddress: r.user,
          actorName: resolveActor(r.user),
          postKey: r.post,
          postPreview: post?.content?.slice(0, 50) || "",
          reactionEmoji: REACTIONS_EMOJI[r.reactionType] || "👍",
          timestamp: Date.now(),
          read: false,
        });
      }

      // ─── Likes on my posts (detect count increases, skip self-likes) ───
      for (const post of myPosts) {
        const currentLikes = Number(post.likes || 0);
        // On first poll or after refresh, just record counts — don't notify
        if (!likeCountsInitialized.current) {
          lastLikeCounts.current[post.publicKey] = currentLikes;
          continue;
        }
        const prevLikes = lastLikeCounts.current[post.publicKey] ?? currentLikes;
        if (currentLikes > prevLikes) {
          // If I just liked this post myself, don't notify
          const iSelfLiked = likedRef.current.includes(post.publicKey);
          const diff = currentLikes - prevLikes;
          // If diff is 1 and I just liked it, skip entirely (it was just me)
          if (iSelfLiked && diff === 1) {
            lastLikeCounts.current[post.publicKey] = currentLikes;
            continue;
          }
          // If diff > 1 and I self-liked, subtract 1 from the count
          const externalLikes = iSelfLiked ? diff - 1 : diff;
          if (externalLikes > 0) {
            const key = `like:${post.publicKey}:${currentLikes}`;
            if (!seen.has(key)) {
              newSeenKeys.push(key);
              newNotifications.push({
                id: uuidv4(),
                type: "like",
                actorAddress: "",
                actorName: `${externalLikes} ${externalLikes === 1 ? "person" : "people"}`,
                postKey: post.publicKey,
                postPreview: post.content?.slice(0, 50) || "",
                timestamp: Date.now(),
                read: false,
              });
            }
          }
        }
        lastLikeCounts.current[post.publicKey] = currentLikes;
      }
      // After processing likes for the first time, mark as initialized
      if (!likeCountsInitialized.current) likeCountsInitialized.current = true;

      // ─── New followers ───
      for (const followerAddr of follows) {
        if (!followerAddr || followerAddr === myAddr) continue;
        const key = `follow:${followerAddr}`;
        if (seen.has(key)) continue;
        newSeenKeys.push(key);
        if (isFirstPoll) continue;
        newNotifications.push({
          id: uuidv4(),
          type: "follow",
          actorAddress: followerAddr,
          actorName: resolveActor(followerAddr),
          timestamp: Date.now(),
          read: false,
        });
      }

      // ─── Reposts of my content ───
      // Use username from currentUser OR from the on-chain profile we just fetched
      const myProfile = profileMap[myAddr];
      const myUsername = (
        currentUser?.username ||
        myProfile?.username ||
        ""
      ).toLowerCase();

      if (myUsername) {
        for (const p of posts) {
          if (p.author === myAddr) continue; // skip my own posts
          const content = p.content || "";
          // Check new format: RT|@myusername|...
          const isNewRepost = content.toLowerCase().startsWith(`rt|@${myUsername}|`);
          // Check legacy format: 🔁 Repost from @myusername:
          const isLegacyRepost = content.match(new RegExp(`^🔁\\s*Repost from @${myUsername}[:\\s]`, "i"));
          if (isNewRepost || isLegacyRepost) {
            const key = `repost:${p.publicKey}`;
            if (seen.has(key)) continue;
            newSeenKeys.push(key);
            if (isFirstPoll) continue;
            newNotifications.push({
              id: uuidv4(),
              type: "repost",
              actorAddress: p.author,
              actorName: resolveActor(p.author),
              postKey: p.publicKey,
              postPreview: content.slice(0, 50) || "",
              timestamp: Number(p.createdAt) * 1000 || Date.now(),
              read: false,
            });
          }
        }
      }

      // ── Tip detection: check for new incoming SOL tips ──
      try {
        const tipRes = await fetch(`/api/tips-received?wallet=${myAddr}`);
        if (tipRes.ok) {
          const tipData = await tipRes.json();
          const currentTotal = tipData.totalSol || 0;
          if (lastTipTotal.current === null) {
            // First check — just record baseline, don't notify
            lastTipTotal.current = currentTotal;
          } else if (currentTotal > lastTipTotal.current) {
            const diff = Math.round((currentTotal - lastTipTotal.current) * 1000) / 1000;
            lastTipTotal.current = currentTotal;
            newNotifications.push({
              id: uuidv4(),
              type: "tip",
              actorAddress: "unknown",
              actorName: "Someone",
              tipAmount: diff,
              postPreview: `+${diff} SOL`,
              timestamp: Date.now(),
              read: false,
            });
          }
        }
      } catch {}

      // Mark initial seed as done
      if (isFirstPoll) {
        initialSeedDone.current = true;
        console.log(`🔔 Notification seed: ${newSeenKeys.length} existing on-chain keys marked as seen`);
      }

      // Commit
      if (newSeenKeys.length > 0) addSeenNotificationKeys(newSeenKeys);
      if (newNotifications.length > 0) {
        addNotifications(newNotifications);
      }
    } catch (err) {
      console.warn("Notification poll error:", err);
    }
  }, [program, publicKey, currentUser, likedPosts, addSeenNotificationKeys, addNotifications]);

  useEffect(() => {
    if (!program || !publicKey) return;

    // Reset initialization state when wallet changes
    initialSeedDone.current = false;
    likeCountsInitialized.current = false;
    lastLikeCounts.current = {};

    // Initial poll after short delay
    const initialTimeout = setTimeout(poll, 2000);

    // Then poll on interval
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [program, publicKey, poll]);
}
