# Shyft — On-Chain Social Platform on Solana

> **Live:** [https://www.shyft.lol](https://www.shyft.lol)  
> **Program ID:** `EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ`  
> **Network:** Solana Devnet

Shyft is the first fully on-chain social platform built on Solana. Every post, comment, like, reaction, follow, repost, and chat message is a Solana transaction — stored permanently on-chain. Users sign in with Privy embedded wallets (email/social login), interact gaslessly via session keys, and receive real-time notifications for all social activity.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [On-Chain Data](#on-chain-data)
- [Session Keys (Gasless UX)](#session-keys-gasless-ux)
- [Real-Time Notifications](#real-time-notifications)
- [Clickable Profiles & Hover Cards](#clickable-profiles--hover-cards)
- [Dark / Light Theme](#dark--light-theme)
- [MagicBlock Integration — TEE Privacy](#magicblock-integration--tee-privacy)
- [On-Chain Program (Rust/Anchor)](#on-chain-program-rustanchor)
- [Frontend (Next.js)](#frontend-nextjs)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)

---

## Features

| Feature | Description | On-Chain? |
|---------|-------------|:---------:|
| **User Profiles** | Username, display name, bio, avatar, banner — stored on Solana | ✅ |
| **Posts** | Create text posts with images, GIFs, links — stored on Solana | ✅ |
| **Comments** | Comment on any post — each comment is a separate PDA | ✅ |
| **Likes** | Like any post — increments an on-chain counter | ✅ |
| **Reactions** | React with ❤️ 🔥 🚀 😂 👏 💡 — each reaction is a PDA | ✅ |
| **Reposts** | Repost anyone's content — creates a new on-chain post with `RT\|@author\|content` | ✅ |
| **Follows** | Follow/unfollow users — on-chain follow accounts with follower/following counters | ✅ |
| **Chat** | 1:1 encrypted messaging between users | ✅ |
| **In-Chat Payments** | Send SOL to friends directly from chat | ✅ |
| **Session Keys** | Gasless interactions — no wallet popup after initial session creation | ✅ |
| **Real-Time Notifications** | Bell icon with live alerts for likes, comments, reactions, reposts, follows (5s polling) | Polling |
| **Clickable Profiles** | Click any username or avatar to view that user's profile (like X/Twitter) | — |
| **Profile Hover Cards** | Hover over any username to see a popup card with avatar, bio, follower/following count | — |
| **Dark / Light Theme** | Night Mode (dark) and Day Mode (light) toggle — persisted across sessions | — |
| **Live Feed Auto-Refresh** | Feed auto-refreshes every 8 seconds — new posts, live like counts, comments, reactions | — |
| **Share** | Share any post — copies a shyft.lol link to clipboard, or uses native share on mobile | — |
| **Wallet Management** | View balance, QR code, export private key, fund via explorer | — |
| **Gold Badges** | OG/founder verification badges (gold gradient for @shaan) on profiles and posts | — |
| **Image Uploads** | Upload images directly in posts via ImgBB hosting | — |
| **Rich Content** | Auto-detect URLs, images, YouTube embeds, GIFs in posts | — |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                         │
│              shyft.lol — React 19, TailwindCSS 4                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐  │
│  │  Feed    │ │  Chat    │ │ Payments │ │ Profile │ │ Notifs │  │
│  │ Posts    │ │ Messages │ │ SOL xfer │ │ View    │ │ Bell   │  │
│  │ Comments │ │          │ │          │ │ Others  │ │ Panel  │  │
│  │ Reactions│ │          │ │          │ │ Follow  │ │        │  │
│  │ Reposts  │ │          │ │          │ │ Wallet  │ │        │  │
│  │ Hover📇 │ │          │ │          │ │ Export  │ │        │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ └───┬────┘  │
│       │            │            │             │          │       │
│       ▼            ▼            ▼             ▼          ▼       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │           ShyftClient (src/lib/program.ts)               │    │
│  │    Anchor RPC · Session Keys · MagicBlock TEE · Cache    │    │
│  └────────────────────────┬─────────────────────────────────┘    │
│                           │                                      │
│  ┌────────────────────────┼─────────────────────────────────┐    │
│  │         Session Key Manager (useSessionKey.ts)           │    │
│  │  Auto-create · 0.05 SOL deposit · 7-day validity         │    │
│  │  Auto-revoke at 2M lamports · Retry-without-session      │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │        Privy Embedded Wallets (@privy-io/react-auth)     │    │
│  │  Email/Social login · Solana wallet · Export private key  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │       Theme System (ThemeProvider + CSS variables)        │    │
│  │  data-theme="light"|"dark" on <html> · 200ms transitions │    │
│  │  Persisted in localStorage via Zustand                    │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Solana Devnet                                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │         Shadowspace Program (Anchor/Rust)                │    │
│  │  EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ          │    │
│  │                                                          │    │
│  │  Instructions:                                           │    │
│  │  • create_profile    • update_profile    • follow_user   │    │
│  │  • create_post       • like_post         • unfollow_user │    │
│  │  • create_comment    • react_to_post                     │    │
│  │  • create_chat       • send_message                      │    │
│  │  • create_conversation • send_conversation_message       │    │
│  │  • delegate_pda      • create_permission • undelegate    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │          Session Token Program (gari-network)            │    │
│  │  Ephemeral keypairs sign TXs without wallet popups       │    │
│  │  #[session_auth_or] macro on all interaction instructions │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐   │
│  │  Permission Program │  │     Delegation Program           │   │
│  │  ACLseoPoyC3cBqoUtk │  │     DELeGGvXpWV2fqJUhqcF5ZS     │   │
│  │  (Access Control)   │  │     (TEE Delegation)             │   │
│  └─────────────────────┘  └──────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              MagicBlock TEE Validator                     │    │
│  │  FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA          │    │
│  │  Intel TDX hardware-level privacy for delegated accounts  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## On-Chain Data

Everything on Shyft is stored as Solana program accounts. Here's what's currently live on devnet:

| Account Type | Count | Rent Each | Description |
|-------------|------:|-----------|-------------|
| **Posts** | 8+ | 0.002763 SOL | Text content, like counter, author, timestamp |
| **Comments** | 23+ | 0.002227 SOL | Comment text, author, linked post, timestamp |
| **Reactions** | 12+ | 0.001399 SOL | Emoji reaction type, user, linked post |
| **Profiles** | 2+ | 0.003083 SOL | Username, display name, bio, avatar URL, banner URL, follower/following/post counts |
| **Follows** | 2+ | 0.001392 SOL | Follower → following relationship |
| **Conversations** | 1+ | 0.052256 SOL | Chat messages between two participants |
| **Total** | **48+** | | **~0.151 SOL total rent** |

Every interaction is a signed Solana transaction. Nothing is stored in a database.

---

## Session Keys (Gasless UX)

Shyft uses the **gari-network session-keys program** to eliminate wallet popups after initial setup:

1. **User connects** via Privy (email, Google, etc.) → embedded Solana wallet created
2. **First interaction** auto-creates a session: user signs once, deposits 0.05 SOL
3. **All subsequent interactions** (posts, comments, likes, reactions) are signed by an ephemeral keypair — **no wallet popup**
4. **Session expires** after 7 days or when balance drops below 2M lamports
5. **Automatic fallback**: if session key runs out of SOL, the app retries with a direct wallet signature

The `#[session_auth_or]` macro is applied to every interaction instruction in the Anchor program:

```rust
#[session_auth_or(
    ctx.accounts.author.key() == ctx.accounts.author.key(),
    ShadowError::Unauthorized
)]
pub fn create_post(...) -> Result<()> { ... }
pub fn create_comment(...) -> Result<()> { ... }
pub fn like_post(...) -> Result<()> { ... }
pub fn react_to_post(...) -> Result<()> { ... }
```

---

## Real-Time Notifications

The notification system polls on-chain data every **5 seconds** and diffs against previously seen keys to detect new activity:

| Notification | Trigger | Example |
|-------------|---------|---------|
| ❤️ **Like** | Someone likes your post | "alice liked your post" |
| 💬 **Comment** | Someone comments on your post | "@alice commented: 'great post!'" |
| 🔥 **Reaction** | Someone reacts to your post | "@alice reacted 🔥 to your post" |
| 🔁 **Repost** | Someone reposts your content | "@alice reposted your post" |
| 👤 **Follow** | Someone follows you | "@alice started following you" |

### How It Works

1. **First poll** on page load seeds all existing on-chain keys as "seen" — no duplicate notifications on refresh
2. **Subsequent polls** every 5 seconds diff new keys against the seen set
3. **clearRpcCache()** is called before every poll to avoid stale Helius RPC data
4. **Seen keys** capped at 2,000 to prevent unbounded localStorage growth
5. **Self-interaction filtering** — you never get notifications for your own activity
6. **Username resolution** — uses on-chain profileMap as fallback when `currentUser` is null (fixes repost attribution)
7. **Sorted by timestamp** — newest notifications appear first in the bell dropdown

---

## Clickable Profiles & Hover Cards

Like X/Twitter, every username and avatar in the feed is interactive:

### Clickable Profiles
- **Post author** (avatar + display name + @username) → Click to view their profile
- **Comment author** (avatar + name) → Click to view their profile
- **Repost original author** ("Reposted from @username") → Click to navigate
- **Cursor** changes to pointer on hover for all clickable profile elements
- **Profile viewing** — when viewing another user's profile: back button, follow/unfollow, explorer link. Wallet management and edit sections are hidden.

### Profile Hover Cards (X-style)
Hover over any username or avatar in the feed to see a popup card:

| Field | Source |
|-------|--------|
| **Avatar** | On-chain `avatarUrl` |
| **Display name** | On-chain `displayName` |
| **@username** | On-chain `username` |
| **Verified badge** | Blue (default) or gold (for OG accounts like @shaan) |
| **Bio** | On-chain `bio` (up to 3 lines) |
| **Following count** | On-chain `followingCount` |
| **Followers count** | On-chain `followerCount` |
| **Post count** | On-chain `postCount` |

The card appears after a **400ms hover delay** and stays open when you move your mouse into it (300ms hide delay). Clicking the avatar or name navigates to the full profile.

### Navigation
- `navigateToProfile(walletAddress)` in Zustand store — sets `viewingProfile` and switches to the Profile tab
- Sidebar and MobileNav "Profile" button always clears `viewingProfile` to show your own profile
- Back button on other users' profiles returns to the feed

---

## Dark / Light Theme

Shyft supports a full **Night Mode** (dark) and **Day Mode** (light) theme with smooth transitions:

### Toggle Locations
| Location | Control |
|----------|---------|
| **Header** | Moon 🌙 / Sun ☀️ icon button (next to notification bell) |
| **Sidebar** (desktop) | "Night Mode" / "Day Mode" button with label |
| **Landing page** | Toggle in the top nav bar (works before sign-in) |

### Implementation

| Layer | How |
|-------|-----|
| **State** | `theme: "light" \| "dark"` in Zustand store, persisted to localStorage |
| **Sync** | `ThemeProvider` component applies `data-theme` attribute to `<html>` |
| **CSS** | `[data-theme="dark"]` selector overrides all hardcoded colors via CSS specificity |
| **Transition** | 200ms ease transition on `background-color`, `border-color`, `color` |
| **Browser chrome** | `<meta name="theme-color">` updates dynamically |

### Dark Theme Covers

- All backgrounds (page `#0F1117`, cards `#1A1D28`, surfaces `#151822`)
- All text colors (primary `#E8ECF4`, muted `#8B92A5`, subtle `#6B7280`)
- All borders and dividers (`#2A2D3A`, `#22252F`)
- Tinted surfaces (notification badges, session status, reaction pills)
- Input fields, textareas, and placeholders
- Scrollbars
- Shadows (darker in dark mode)
- Gradients
- Hover states
- Backdrop blur (mobile nav, landing nav)
- Profile hover cards and notification panels
- Wallet adapter modals

Animation elements (`animate-pulse`, `animate-spin`, `animate-fade-in`, etc.) are excluded from the transition to prevent visual jank.

---

## MagicBlock Integration — TEE Privacy

MagicBlock is used for **privacy and access control** via the Ephemeral Rollups SDK:

### TEE Delegation Flow

```
User creates account → Permission created (access control) → PDA delegated to TEE (Intel TDX)
```

### Integration Points

| Instruction | What it does | MagicBlock Feature |
|-------------|-------------|-------------------|
| `create_permission` | Restricts who can read/write a PDA inside TEE | **Access Control** |
| `delegate_pda` | Moves PDA data into Intel TDX hardware | **TEE Delegation** |
| `update_profile_privacy` | Toggles profile visibility via permission update | **Access Control** |
| `undelegate` | Commits state and moves account back to Solana | **Commit & Undelegate** |

### Programs Used

| Program | Address | Purpose |
|---------|---------|---------|
| **Permission Program** | `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` | Access control on PDAs |
| **Delegation Program** | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` | Delegate PDAs to TEE |
| **TEE Validator** | `FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA` | Intel TDX hardware validator |

---

## On-Chain Program (Rust/Anchor)

**Location:** `programs/shadowspace/src/lib.rs` (~1092 lines)

### Account Types (PDAs)

| Account | Seeds | Description |
|---------|-------|-------------|
| **Profile** | `["profile", owner]` | Username, display name, bio, avatar, banner, privacy flag, post/follower/following counts, created_at |
| **Post** | `["post", author, post_id]` | Content, likes counter, comment count, privacy flag, timestamp |
| **Comment** | `["comment", post, author, comment_index]` | Comment text, author, linked post, timestamp |
| **Reaction** | `["reaction", post, user]` | Reaction type (0-5), user, linked post |
| **FollowAccount** | `["follow", follower, following]` | Follower → following relationship, increments profile counters |
| **Conversation** | `["conversation", participant1, participant2]` | Chat with message history |

### Instructions

| Instruction | Session Key? | Description |
|-------------|:------------:|-------------|
| `create_profile` | — | Initialize profile PDA (username, display name, bio) |
| `update_profile` | — | Update display name, bio, avatar URL, banner URL |
| `create_post` | ✅ | Create post, increment author's post count |
| `create_comment` | ✅ | Comment on a post |
| `like_post` | ✅ | Increment post's like counter |
| `react_to_post` | ✅ | Create reaction PDA (one per user per post) |
| `follow_user` | — | Create follow account, increment follower/following counters |
| `unfollow_user` | — | Close follow account, decrement counters |
| `create_conversation` | — | Create chat between two users |
| `send_conversation_message` | — | Add message to conversation |
| `create_permission` | — | MagicBlock permission on PDA |
| `delegate_pda` | — | Delegate PDA to TEE |
| `undelegate` | — | Commit & undelegate back to Solana |

---

## Frontend (Next.js)

### Core Components

| Component | File | Description |
|-----------|------|-------------|
| **Feed** | `Feed.tsx` | Post feed with comments, likes, reactions, reposts, share. Rich content rendering. Session key retry fallback. Auto-refresh every 8s. |
| **Profile** | `Profile.tsx` | Profile page with posts tab, wallet management (balance, QR, export, fund), gold badges, interactive post cards. Supports viewing other users' profiles with follow/unfollow. |
| **ProfileHoverCard** | `ProfileHoverCard.tsx` | X-style hover popup card with avatar, name, username, bio, follower/following/post counts. 400ms show delay, 300ms hide delay. |
| **ThemeProvider** | `ThemeProvider.tsx` | Syncs Zustand `theme` state to `data-theme` attribute on `<html>` and updates `<meta theme-color>`. |
| **Chat** | `Chat.tsx` | 1:1 messaging with TEE-protected messages |
| **Header** | `Header.tsx` | App header with theme toggle (Moon/Sun), notification bell (unread badge, dropdown panel), wallet button |
| **Friends** | `Friends.tsx` | Follow/unfollow users, discover people |
| **Payments** | `Payments.tsx` | SOL payment UI |
| **ProfileSetup** | `ProfileSetup.tsx` | First-time onboarding |
| **Landing** | `Landing.tsx` | Pre-connect landing page with theme toggle |
| **Sidebar** | `Sidebar.tsx` | Desktop navigation with "Night Mode" / "Day Mode" toggle |
| **MobileNav** | `MobileNav.tsx` | Mobile bottom navigation |
| **RichContent** | `RichContent.tsx` | URL/image/video/YouTube auto-detection and rendering |
| **Toast** | `Toast.tsx` | Toast notification system |
| **CreatorDashboard** | `CreatorDashboard.tsx` | Analytics dashboard |
| **OnboardingDemo** | `OnboardingDemo.tsx` | Walkthrough for new users |

### Key Libraries

| File | Purpose |
|------|---------|
| `src/lib/program.ts` | **ShyftClient** (~1785 lines) — All Solana interactions, caching, session key support, follow/unfollow, profile fetching |
| `src/lib/store.ts` | Zustand store — theme, notifications, liked posts, seen keys, viewingProfile, navigateToProfile, UI state |
| `src/hooks/useSessionKey.ts` | Session key lifecycle — create, check, revoke, auto-fund |
| `src/hooks/useNotifications.ts` | On-chain polling every 5s for likes, comments, reactions, reposts, follows |
| `src/hooks/useProgram.ts` | React hook for ShyftClient |
| `src/hooks/usePrivatePayment.ts` | SOL transfer hook |
| `src/contexts/WalletProvider.tsx` | Privy + Solana wallet setup |
| `src/lib/idl.json` | Anchor IDL for the program |

---

## Project Structure

```
shadowspace/
├── programs/shadowspace/
│   ├── Cargo.toml                 # Rust deps (anchor, ephemeral-rollups-sdk, session-keys)
│   └── src/lib.rs                 # Solana program (~1092 lines)
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout with Privy + WalletProvider + ThemeProvider
│   │   ├── page.tsx               # Main page with tab routing
│   │   ├── globals.css            # TailwindCSS styles + dark/light theme system
│   │   └── api/
│   │       ├── magicblock/route.ts # MagicBlock API proxy
│   │       └── upload/route.ts    # Image upload API (ImgBB)
│   ├── components/
│   │   ├── Feed.tsx               # Post feed with full interactions + ProfileHoverCards
│   │   ├── Chat.tsx               # 1:1 messaging
│   │   ├── Payments.tsx           # SOL payments
│   │   ├── Profile.tsx            # Profile + wallet management + view other users
│   │   ├── ProfileSetup.tsx       # Onboarding
│   │   ├── ProfileHoverCard.tsx   # X-style hover popup card
│   │   ├── ThemeProvider.tsx      # Dark/light theme sync
│   │   ├── Friends.tsx            # Follow/discover
│   │   ├── Landing.tsx            # Pre-connect landing + theme toggle
│   │   ├── Header.tsx             # Header + theme toggle + notification bell
│   │   ├── Sidebar.tsx            # Desktop nav + night/day mode toggle
│   │   ├── MobileNav.tsx          # Mobile nav (clears viewingProfile)
│   │   ├── RichContent.tsx        # URL/image/video/YouTube detection
│   │   ├── Toast.tsx              # Toast notifications
│   │   ├── CreatorDashboard.tsx   # Analytics dashboard
│   │   └── OnboardingDemo.tsx     # Walkthrough
│   ├── contexts/
│   │   └── WalletProvider.tsx     # Privy embedded wallet setup
│   ├── hooks/
│   │   ├── useProgram.ts          # ShyftClient hook
│   │   ├── useSessionKey.ts       # Session key management
│   │   ├── useNotifications.ts    # On-chain notification polling (5s, clearRpcCache)
│   │   ├── usePrivyWallet.ts      # Privy wallet hook (export private key)
│   │   └── usePrivatePayment.ts   # SOL payment hook
│   ├── lib/
│   │   ├── program.ts             # ShyftClient — all Solana RPC interactions (~1785 lines)
│   │   ├── store.ts               # Zustand state (theme, notifications, viewingProfile, etc.)
│   │   ├── magicblock.ts          # MagicBlock API helpers
│   │   ├── constants.ts           # Program IDs, URLs
│   │   └── idl.json               # Anchor IDL
│   └── types/
│       ├── index.ts               # TypeScript interfaces
│       └── shadowspace.ts         # Generated program types
├── target/
│   ├── deploy/shadowspace-keypair.json
│   ├── idl/shadowspace.json       # Generated IDL
│   └── types/shadowspace.ts       # Generated types
├── Anchor.toml                    # Anchor config (devnet)
├── Cargo.toml                     # Workspace Cargo config
├── package.json                   # Node.js dependencies
├── next.config.ts                 # Next.js configuration
└── tsconfig.json                  # TypeScript configuration
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Rust** + **Anchor CLI** 0.32.1
- **Solana CLI** with devnet configured

### 1. Clone & Install

```bash
git clone <repo-url>
cd shadowspace
npm install
```

### 2. Build the Solana Program

```bash
anchor build
```

The program is already deployed to devnet at `EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ`.

### 3. Run the Frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Sign In & Use

1. Click **Sign In** — Privy creates an embedded Solana wallet (email, Google, etc.)
2. **Create your profile** (username, display name, bio)
3. **Post** — type something and hit post (stored on Solana!)
4. **Interact** — like, comment, react, repost other posts
5. **Click any username** to view their profile — hover for a preview card
6. **Follow** people and chat with them
7. **Toggle Night Mode** 🌙 from the header, sidebar, or landing page
8. **Check notifications** — bell icon shows real-time activity (polls every 5s)

---

## Deployment

### Frontend (Vercel)

```bash
npx vercel --prod
```

Live at [https://www.shyft.lol](https://www.shyft.lol).

### Solana Program

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Program ID: `EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Solana (Devnet) |
| **Smart Contract** | Anchor 0.32.1 (Rust) |
| **Session Keys** | gari-network session-keys program |
| **Privacy/TEE** | MagicBlock Ephemeral Rollups SDK 0.8.0, Intel TDX |
| **Frontend** | Next.js 16.1.7 (React 19, Turbopack) |
| **Auth** | Privy `@privy-io/react-auth` ^3.18.0 (embedded Solana wallets) |
| **Styling** | Tailwind CSS 4.2 |
| **State** | Zustand 5.0 (persisted — theme, notifications, liked posts, seen keys) |
| **Icons** | Lucide React |
| **Images** | ImgBB API |
| **Deployment** | Vercel |
| **RPC** | Helius Devnet |

---

## How It Works

1. **Everything is on-chain.** Posts, comments, likes, reactions, follows, reposts, profiles, and chat messages are all Solana program accounts. Each interaction is a signed transaction.

2. **Session keys eliminate friction.** After a one-time session creation (one wallet signature + 0.05 SOL deposit), all interactions are signed by an ephemeral keypair — no more wallet popups. If the session runs low on SOL, the app automatically falls back to direct wallet signing.

3. **Privy makes onboarding easy.** Users sign in with email, Google, or any social provider. Privy creates an embedded Solana wallet — no browser extension needed. Users can export their private key or view their wallet on Solana Explorer.

4. **Real-time notifications via on-chain polling.** Every 5 seconds, the app fetches all comments, reactions, follows, and posts from the chain, diffs against what it's seen before, and surfaces new activity as notifications. Self-interactions are filtered out. First poll on page load seeds all existing keys to prevent duplicate notifications on refresh.

5. **TEE privacy for sensitive data.** Posts and messages can be delegated to MagicBlock's TEE validator (Intel TDX), where data is hardware-encrypted and only accessible to permissioned pubkeys.

6. **Reposts are on-chain posts.** When you repost someone's content, a new post is created on-chain with the format `RT|@original_author|content`. The feed detects this prefix and renders it as a styled quote card. The original author receives a repost notification.

7. **Clickable profiles like X/Twitter.** Every username and avatar in the feed is clickable — navigates to that user's full profile with their posts, follower/following counts, and a follow/unfollow button. Hovering shows an X-style popup card with their avatar, bio, and stats.

8. **Dark/light theme.** Users can toggle between Night Mode and Day Mode from the header, sidebar, or landing page. The theme is persisted across sessions via localStorage. All colors, backgrounds, borders, shadows, inputs, scrollbars, and hover states adapt with smooth 200ms transitions.

9. **Live feed.** The feed auto-refreshes every 8 seconds — fetching new posts, updated like counts, comments, and reactions from the chain with cache busting to ensure freshness.

---

## License

ISC
