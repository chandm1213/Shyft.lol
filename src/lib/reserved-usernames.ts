/**
 * Reserved usernames — prevents squatting of brand names, system words, and offensive terms.
 *
 * To whitelist a brand:
 *   1. Verify them (Twitter DM, email, etc.)
 *   2. Add entry to INVITE_CODES: { username: "solana", code: "YOUR-CODE-HERE" }
 *   3. Send them the code
 *   4. git push → Vercel redeploys → they can sign up with the code
 *   5. After they sign up, remove the code entry (single-use)
 */

// ─── Blocked usernames (no one can register these without an invite code) ───

const BLOCKED_USERNAMES = new Set([
  // System / platform
  "admin", "administrator", "mod", "moderator", "support", "help", "official",
  "shyft", "shyftlol", "shyft_official", "shyftapp", "shyftsocial",
  "system", "root", "null", "undefined", "api", "www", "mail", "info",
  "team", "staff", "bot", "test", "dev", "beta", "alpha",
  "login", "signup", "register", "account", "settings", "dashboard",
  "feed", "chat", "profile", "explore", "search", "notifications",
  "payment", "payments", "wallet", "tokens", "token",

  // Crypto brands
  "solana", "ethereum", "bitcoin", "coinbase", "binance", "phantom",
  "metamask", "opensea", "raydium", "jupiter", "jup", "marinade",
  "tensor", "magiceden", "magic_eden", "helius", "privy", "orca",
  "drift", "mango", "serum", "bonk", "jito", "pyth", "wormhole",
  "circle", "usdc", "usdt", "tether", "chainlink", "uniswap",
  "aave", "compound", "makerdao", "lido", "polygon", "avalanche",
  "arbitrum", "optimism", "sui", "aptos", "near", "cosmos",
  "bags", "bagsfm", "bags_fm", "bagsapp", "finnbags",

  // Big tech / brands
  "apple", "google", "microsoft", "amazon", "meta", "facebook",
  "instagram", "twitter", "tiktok", "youtube", "twitch", "discord",
  "snapchat", "whatsapp", "telegram", "signal", "reddit", "linkedin",
  "nike", "adidas", "tesla", "spacex", "openai", "chatgpt",
  "anthropic", "claude", "gemini", "nvidia", "samsung",

  // Reserved for specific users
  "fezweb3", "catmcgee", "stuubags", "solanasensei",

  // Offensive (abbreviated — add more as needed)
  "fuck", "shit", "ass", "dick", "porn", "sex", "nazi", "hitler",
  "racist", "n1gger", "nigger", "faggot", "retard", "kill", "murder",
]);

// ─── Invite codes for reserved usernames ───
// When a brand is verified, add: { username: "solana", code: "SOL-SHYFT-9X2K" }
// After they sign up, remove the entry (single-use)

interface InviteEntry {
  username: string;
  code: string;
}

const INVITE_CODES: InviteEntry[] = [
  { username: "bitcoin", code: "BTC-SHYFT-2026" },
  { username: "shyft", code: "SHYFT-SHYFT-2026" },
  { username: "fezweb3", code: "FEZ-SHYFT-2026" },
  { username: "catmcgee", code: "CAT-SHYFT-2026" },
  { username: "stuubags", code: "STUU-SHYFT-2026" },
  { username: "solanasensei", code: "SENSEI-SHYFT-2026" },
  { username: "finnbags", code: "FINN-SHYFT-2026" },
  // Add more: { username: "solana", code: "SOL-SHYFT-9X2K" },
];

// ─── Minimum username length ───
const MIN_USERNAME_LENGTH = 3;

// ─── Check functions ───

/**
 * Check if a username is reserved/blocked.
 * Returns { blocked: true, reason: "..." } if blocked, or { blocked: false } if available.
 * If an invite code is provided and matches, the username is unlocked.
 */
export function checkUsername(
  username: string,
  inviteCode?: string
): { blocked: boolean; reason?: string; needsCode?: boolean } {
  const lower = username.toLowerCase().trim();

  // Too short
  if (lower.length < MIN_USERNAME_LENGTH) {
    return { blocked: true, reason: `Username must be at least ${MIN_USERNAME_LENGTH} characters` };
  }

  // Check if it's in the blocked list
  if (BLOCKED_USERNAMES.has(lower)) {
    // Check if there's a valid invite code for this username
    if (inviteCode) {
      const entry = INVITE_CODES.find(
        (e) => e.username.toLowerCase() === lower && e.code === inviteCode
      );
      if (entry) {
        return { blocked: false }; // Invite code valid — allow it
      }
      return { blocked: true, reason: "Invalid invite code", needsCode: true };
    }
    return { blocked: true, reason: "This username is reserved", needsCode: true };
  }

  return { blocked: false };
}

/**
 * Check if a reserved username has an invite code available.
 * (Used to show/hide the invite code input in the UI)
 */
export function hasInviteCode(username: string): boolean {
  const lower = username.toLowerCase().trim();
  return INVITE_CODES.some((e) => e.username.toLowerCase() === lower);
}

/**
 * Get the full blocked list (for admin reference).
 */
export function getBlockedUsernames(): string[] {
  return Array.from(BLOCKED_USERNAMES);
}
