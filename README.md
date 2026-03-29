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
| **Follows** | Follow/unfollow users — on-chain follow accounts | ✅ |
| **Chat** | 1:1 encrypted messaging between users | ✅ |
| **In-Chat Payments** | Send SOL to friends directly from chat | ✅ |
| **Session Keys** | Gasless interactions — no wallet popup after initial session creation | ✅ |
| **Real-Time Notifications** | Bell icon with live alerts for likes, comments, reactions, reposts, follows | Polling |
| **Wallet Management** | View balance, QR code, export private key, fund via explorer | — |
| **Gold Badges** | OG/founder verification badges on profiles and posts | — |
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
│  │ Posts    │ │ Messages │ │ SOL xfer │ │ Setup   │ │ Bell   │  │
│  │ Comments │ │          │ │          │ │ Wallet  │ │ Panel  │  │
│  │ Reactions│ │          │ │          │ │ Export  │ │        │  │
│  │ Reposts  │ │          │ │          │ │         │ │        │  │
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
| **Profiles** | 2+ | 0.003083 SOL | Username, display name, bio, avatar URL, banner URL |
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

The notification system polls on-chain data every **20 seconds** and diffs against previously seen keys to detect new activity:

| Notification | Trigger | Example |
|-------------|---------|---------|
| ❤️ **Like** | Someone likes your post | "2 people liked your post" |
| 💬 **Comment** | Someone comments on your post | "@lmao commented: 'hahah'" |
| 🔥 **Reaction** | Someone reacts to your post | "@lmao reacted �� to your post" |
| 🔁 **Repost** | Someone reposts your content | "@shaan reposted your post" |
| �� **Follow** | Someone follows you | "@lmao started following you" |

**Self-interaction filtering:** You never receive notifications for your own likes, comments, reactions, or reposts on your own posts.

Notifications are displayed via a **bell icon** in the header with an unread badge. The notification panel shows actor names (resolved from on-chain profiles), post previews, timestamps, and a "Mark all read" button. State is persisted in localStorage.

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
| **Profile** | `["profile", owner]` | Username, display name, bio, avatar, banner, privacy, counters |
| **Post** | `["post", author, post_id]` | Content, likes counter, comment count, privacy flag |
| **Comment** | `["comment", post, author, comment_index]` | Comment text, author, linked post, timestamp |
| **Reaction** | `["reaction", post, user]` | Reaction type (0-5), user, linked post |
| **FollowAccount** | `["follow", follower, following]` | Follower → following relationship |
| **Conversation** | `["conversation", participant1, participant2]` | Chat with message history |

### Instructions

| Instruction | Session Key? | Description |
|-------------|:------------:|-------------|
| `create_profile` | — | Initialize profile PDA |
| `update_profile` | — | Update username, bio, avatar, banner |
| `create_post` | ✅ | Create post, increment author's post count |
| `create_comment` | ✅ | Comment on a post |
| `like_post` | ✅ | Increment post's like counter |
| `react_to_post` | ✅ | Create reaction PDA (one per user per post) |
| `follow_user` | — | Create follow account |
| `unfollow_user` | — | Close follow account |
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
| **Feed** | `Feed.tsx` | Post feed with comments, likes, reactions, reposts, share. Rich content rendering. Session key retry fallback. |
| **Profile** | `Profile.tsx` | Profile page with posts tab, wallet management (balance, QR, export, fund), gold badges, interactive post cards |
| **Chat** | `Chat.tsx` | 1:1 messaging with TEE-protected messages |
| **Header** | `Header.tsx` | App header with wallet button + notification bell (unread badge, dropdown panel) |
| **Friends** | `Friends.tsx` | Follow/unfollow users, discover people |
| **Payments** | `Payments.tsx` | SOL payment UI |
| **ProfileSetup** | `ProfileSetup.tsx` | First-time onboarding |
| **Landing** | `Landing.tsx` | Pre-connect landing page |
| **Sidebar** | `Sidebar.tsx` | Desktop navigation |
| **MobileNav** | `MobileNav.tsx` | Mobile bottom navigation |
| **Toast** | `Toast.tsx` | Toast notification system |

### Key Libraries

| File | Purpose |
|------|---------|
| `src/lib/program.ts` | **ShyftClient** (~1785 lines) — All Solana interactions, caching, session key support |
| `src/lib/store.ts` | Zustand store — notifications, liked posts, seen keys, UI state |
| `src/hooks/useSessionKey.ts` | Session key lifecycle — create, check, revoke, auto-fund |
| `src/hooks/useNotifications.ts` | On-chain polling for likes, comments, reactions, reposts, follows |
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
│   │   ├── layout.tsx             # Root layout with Privy + WalletProvider
│   │   ├── page.tsx               # Main page with tab routing
│   │   ├── globals.css            # TailwindCSS styles
│   │   └── api/
│   │       └── magicblock/route.ts # MagicBlock API proxy
│   ├── components/
│   │   ├── Feed.tsx               # Post feed with full interactions
│   │   ├── Chat.tsx               # 1:1 messaging
│   │   ├── Payments.tsx           # SOL payments
│   │   ├── Profile.tsx            # Profile + wallet management
│   │   ├── ProfileSetup.tsx       # Onboarding
│   │   ├── Friends.tsx            # Follow/discover
│   │   ├── Landing.tsx            # Pre-connect landing
│   │   ├── Header.tsx             # Header + notification bell
│   │   ├── Sidebar.tsx            # Desktop nav
│   │   ├── MobileNav.tsx          # Mobile nav
│   │   ├── RichContent.tsx        # URL/image/video/YouTube detection
│   │   ├── Toast.tsx              # Toast notifications
│   │   ├── CreatorDashboard.tsx   # Analytics dashboard
│   │   └── OnboardingDemo.tsx     # Walkthrough
│   ├── contexts/
│   │   └── WalletProvider.tsx     # Privy embedded wallet setup
│   ├── hooks/
│   │   ├── useProgram.ts          # ShyftClient hook
│   │   ├── useSessionKey.ts       # Session key management
│   │   ├── useNotifications.ts    # On-chain notification polling
│   │   └── usePrivatePayment.ts   # SOL payment hook
│   ├── lib/
│   │   ├── program.ts             # ShyftClient — all Solana RPC interactions
│   │   ├── store.ts               # Zustand state (notifications, liked posts, etc.)
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
5. **Follow** people and chat with them
6. **Check notifications** — bell icon shows real-time activity

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
| **State** | Zustand 5.0 (persisted) |
| **Icons** | Lucide React |
| **Images** | ImgBB API |
| **Deployment** | Vercel |
| **RPC** | Helius Devnet |

---

## How It Works

1. **Everything is on-chain.** Posts, comments, likes, reactions, follows, reposts, profiles, and chat messages are all Solana program accounts. Each interaction is a signed transaction.

2. **Session keys eliminate friction.** After a one-time session creation (one wallet signature + 0.05 SOL deposit), all interactions are signed by an ephemeral keypair — no more wallet popups. If the session runs low on SOL, the app automatically falls back to direct wallet signing.

3. **Privy makes onboarding easy.** Users sign in with email, Google, or any social provider. Privy creates an embedded Solana wallet — no browser extension needed. Users can export their private key or view their wallet on Solana Explorer.

4. **Real-time notifications via on-chain polling.** Every 20 seconds, the app fetches all comments, reactions, follows, and posts from the chain, diffs against what it's seen before, and surfaces new activity as notifications. Self-interactions are filtered out.

5. **TEE privacy for sensitive data.** Posts and messages can be delegated to MagicBlock's TEE validator (Intel TDX), where data is hardware-encrypted and only accessible to permissioned pubkeys.

6. **Reposts are on-chain posts.** When you repost someone's content, a new post is created on-chain with the format `RT|@original_author|content`. The feed detects this prefix and renders it as a styled quote card. The original author receives a repost notification.

---

## License

ISC
