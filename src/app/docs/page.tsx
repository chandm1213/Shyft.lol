"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  MessageCircle,
  Wallet,
  Lock,
  Users,
  Zap,
  ChevronRight,
  Globe,
  ArrowLeft,
  Copy,
  Check,
  Sun,
  Moon,
  Coins,
  BarChart3,
  Code2,
  Database,
  Key,
  Server,
  FileCode2,
  Layers,
  ExternalLink,
  BookOpen,
  Search,
  ChevronDown,
} from "lucide-react";

/* ────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────── */

const PROGRAM_ID = "EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "features", label: "Features" },
  { id: "onchain-program", label: "On-Chain Program" },
  { id: "treasury", label: "Treasury & Gasless UX" },
  { id: "encryption", label: "E2E Encryption" },
  { id: "creator-tokens", label: "Creator Tokens" },
  { id: "tech-stack", label: "Tech Stack" },
  { id: "faq", label: "FAQ" },
];

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function CopyBlock({ text, language = "bash" }: { text: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#1A1A2E] text-[#E2E8F0] text-[13px] leading-relaxed my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A2E]/80 border-b border-[#334155]">
        <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">{language}</span>
        <button onClick={copy} className="flex items-center gap-1 text-[10px] text-[#94A3B8] hover:text-white transition-colors">
          {copied ? <><Check className="w-3 h-3 text-[#16A34A]" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="px-4 py-3 overflow-x-auto"><code>{text}</code></pre>
    </div>
  );
}

function SectionHeading({ id, children, icon: Icon }: { id: string; children: React.ReactNode; icon: React.ComponentType<any> }) {
  return (
    <div id={id} className="scroll-mt-24 pt-10 pb-4 border-b border-[#E2E8F0]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#2563EB]" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#1A1A2E]">{children}</h2>
      </div>
    </div>
  );
}

function InfoCard({ title, children, accent = "blue" }: { title: string; children: React.ReactNode; accent?: "blue" | "green" | "purple" | "orange" }) {
  const colors = {
    blue: "border-[#2563EB]/20 bg-[#EFF6FF]",
    green: "border-[#16A34A]/20 bg-[#F0FDF4]",
    purple: "border-[#7C3AED]/20 bg-[#F5F3FF]",
    orange: "border-[#F59E0B]/20 bg-[#FFFBEB]",
  };
  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${colors[accent]} my-4`}>
      <p className="text-sm font-semibold text-[#1A1A2E] mb-2">{title}</p>
      <div className="text-[13px] text-[#475569] leading-relaxed">{children}</div>
    </div>
  );
}

function TableRow({ cells, header = false }: { cells: string[]; header?: boolean }) {
  const Tag = header ? "th" : "td";
  return (
    <tr className={header ? "bg-[#F8FAFC]" : "hover:bg-[#F8FAFC] transition-colors"}>
      {cells.map((cell, i) => (
        <Tag key={i} className={`px-4 py-2.5 text-left text-[13px] border-b border-[#E2E8F0] ${header ? "font-semibold text-[#1A1A2E]" : "text-[#475569]"} ${i === 0 && !header ? "font-medium text-[#1A1A2E]" : ""}`}>
          {cell}
        </Tag>
      ))}
    </tr>
  );
}

/* ────────────────────────────────────────────
   FAQ Accordion
   ──────────────────────────────────────────── */

const FAQ_ITEMS = [
  {
    q: "Do I need SOL to use Shyft?",
    a: "No. Shyft's treasury pays all transaction fees and account rent. You sign in, get an instant wallet, and start using the platform for free.",
  },
  {
    q: "Is my data really on-chain?",
    a: "Yes. Every post, profile, follow, comment, reaction, and chat message is stored as a Solana PDA (Program Derived Address). There is no backend database.",
  },
  {
    q: "Can Shyft read my encrypted messages?",
    a: "No. Chat encryption uses NaCl Box (X25519 + XSalsa20-Poly1305). Your encryption keys are derived from a wallet signature — only you and the recipient can decrypt messages.",
  },
  {
    q: "What happens if Shyft goes offline?",
    a: "All data lives on Solana. Anyone with the program ID can read public posts and profiles directly from the blockchain. Your data survives independent of the app.",
  },
  {
    q: "What are Creator Tokens?",
    a: "Creators can launch personal tokens using the Bags SDK. These tokens have bonding-curve pricing — the price increases as more people buy. Creators earn fees from every trade.",
  },
  {
    q: "Which network does Shyft use?",
    a: "The social protocol (posts, chat, profiles) runs on Solana Devnet. Creator Tokens trade on Solana Mainnet via the Bags protocol.",
  },
  {
    q: "Can I use my own Solana wallet?",
    a: "Shyft uses Privy for authentication which creates an embedded Solana wallet. You can also export your private key from the Profile page.",
  },
  {
    q: "Is Shyft open source?",
    a: "Yes. The full codebase including the Anchor program is available on GitHub at github.com/chandm1213/Shyft.lol.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E2E8F0]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 text-left gap-4">
        <span className="text-sm font-medium text-[#1A1A2E]">{q}</span>
        <ChevronDown className={`w-4 h-4 text-[#94A3B8] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pb-4 text-[13px] text-[#64748B] leading-relaxed animate-fade-in">
          {a}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN DOCS PAGE
   ════════════════════════════════════════════ */

export default function DocsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = SECTIONS.filter((s) =>
    s.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* ── Top Nav ── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="text-5xl sm:text-6xl font-black text-[#1F2937] group-hover:text-[#2563EB] transition-colors" style={{ fontFamily: "Georgia, serif", fontWeight: "900", lineHeight: "1" }}>
              S
            </div>
            <div>
              <h1 className="text-base font-bold text-[#1A1A2E]">Shyft</h1>
              <p className="text-[9px] text-[#64748B] -mt-0.5">Documentation</p>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#2563EB] transition-colors">
            <Globe className="w-3.5 h-3.5" /> Explorer
          </a>
          <a href="https://github.com/chandm1213/Shyft.lol" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#2563EB] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
            GitHub
          </a>
          <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg transition-colors">
            Open App
          </Link>
          {/* Mobile sidebar toggle */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 rounded-lg hover:bg-[#F1F5F9]">
            <BookOpen className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto flex">
        {/* ── Sidebar ── */}
        <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-[53px] left-0 z-40 w-64 h-[calc(100vh-53px)] bg-white lg:bg-transparent border-r border-[#E2E8F0] lg:border-0 overflow-y-auto transition-transform duration-300 lg:transition-none`}>
          <div className="px-4 py-5">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search docs..."
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8] mb-3">Contents</p>
            <nav className="space-y-0.5">
              {filteredSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-[#64748B] hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-all"
                >
                  <ChevronRight className="w-3 h-3" />
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Main Content ── */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 md:px-10 py-6 pb-20 lg:border-l lg:border-[#E2E8F0]">
          {/* Hero */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full">v1.0</span>
              <span className="text-[10px] text-[#94A3B8]">Last updated March 2026</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#1A1A2E] leading-tight">
              Shyft Documentation
            </h1>
            <p className="text-base sm:text-lg text-[#64748B] mt-3 leading-relaxed max-w-2xl">
              Complete reference for Shyft — the fully on-chain social platform built on Solana with end-to-end encrypted messaging, creator tokens, and a gasless experience.
            </p>
          </div>

          {/* ═══════════ OVERVIEW ═══════════ */}
          <SectionHeading id="overview" icon={BookOpen}>Overview</SectionHeading>
          <div className="prose-sm mt-4 text-[#475569] leading-relaxed space-y-4">
            <p>
              <strong className="text-[#1A1A2E]">Shyft</strong> is a fully decentralized social platform where every interaction — posts, comments, likes, follows, reactions, and private messages — is a Solana transaction stored permanently on-chain. There is no centralized database, no backend server holding your data, and no single point of failure.
            </p>
            <p>
              Users sign in with their Twitter account, email, or Google via <strong>Privy</strong> and receive an instant embedded Solana wallet. No seed phrases, no browser extensions, no SOL required. The platform&apos;s treasury sponsors all transaction fees, making the experience completely free.
            </p>
            <p>
              Creators can launch personal tokens directly inside Shyft using the <strong>Bags SDK</strong>. Fans buy and sell these tokens in-app, and every trade generates revenue that flows back to the creator through fee sharing.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-6">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] flex items-center justify-center mx-auto mb-2"><Shield className="w-5 h-5 text-[#2563EB]" /></div>
              <p className="text-sm font-semibold text-[#1A1A2E]">Fully On-Chain</p>
              <p className="text-[11px] text-[#94A3B8] mt-1">No database. Every byte lives on Solana.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-2"><Lock className="w-5 h-5 text-[#16A34A]" /></div>
              <p className="text-sm font-semibold text-[#1A1A2E]">E2E Encrypted</p>
              <p className="text-[11px] text-[#94A3B8] mt-1">NaCl Box encryption. Not even the app can read DMs.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#F5F3FF] flex items-center justify-center mx-auto mb-2"><Zap className="w-5 h-5 text-[#7C3AED]" /></div>
              <p className="text-sm font-semibold text-[#1A1A2E]">Zero Gas Fees</p>
              <p className="text-[11px] text-[#94A3B8] mt-1">Treasury-sponsored. Users never pay a cent.</p>
            </div>
          </div>

          {/* ═══════════ ARCHITECTURE ═══════════ */}
          <SectionHeading id="architecture" icon={Layers}>Architecture</SectionHeading>
          <div className="mt-4 text-[#475569] leading-relaxed space-y-4 text-[13px]">
            <p>Shyft is a two-layer architecture: the frontend and the on-chain program communicate through a treasury sponsorship layer that abstracts gas fees away from users.</p>
          </div>
          <CopyBlock language="text" text={`Frontend (Next.js 16 · React 19 · Tailwind CSS 4)
    ↓
Shyft Client Layer
    ↓                           ↓
Treasury Sponsorship        Bags SDK (Mainnet)
  Gasless signing              Token launch, trade, earnings
    ↓                           ↓
Solana Devnet               Solana Mainnet
  Anchor Program               Bags Protocol`} />

          <div className="overflow-x-auto my-6">
            <table className="w-full border border-[#E2E8F0] rounded-xl overflow-hidden text-left">
              <thead>
                <TableRow header cells={["Layer", "Technology"]} />
              </thead>
              <tbody>
                <TableRow cells={["Frontend", "Next.js 16, React 19, Tailwind CSS 4, Zustand"]} />
                <TableRow cells={["Authentication", "Privy — Twitter OAuth, Email, Google, Embedded Wallets"]} />
                <TableRow cells={["On-Chain Program", "Rust / Anchor 0.30, deployed on Solana Devnet"]} />
                <TableRow cells={["Encryption", "NaCl Box via tweetnacl — X25519 + XSalsa20-Poly1305"]} />
                <TableRow cells={["Creator Tokens", "@bagsfm/bags-sdk on Solana Mainnet"]} />
                <TableRow cells={["RPC Provider", "Helius"]} />
                <TableRow cells={["State Management", "Zustand"]} />
                <TableRow cells={["Hosting", "Vercel"]} />
              </tbody>
            </table>
          </div>

          {/* ═══════════ FEATURES ═══════════ */}
          <SectionHeading id="features" icon={Zap}>Features</SectionHeading>

          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            {/* Social */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center"><Globe className="w-4 h-4 text-[#2563EB]" /></div>
                <h3 className="text-sm font-semibold text-[#1A1A2E]">Social</h3>
              </div>
              <ul className="space-y-1.5 text-[13px] text-[#475569]">
                <li className="flex items-start gap-2"><span className="text-[#2563EB] mt-0.5">•</span>On-chain profiles with username, bio, avatar &amp; banner</li>
                <li className="flex items-start gap-2"><span className="text-[#2563EB] mt-0.5">•</span>Posts, comments, likes, reactions (❤️🔥🚀😂👏💡), reposts</li>
                <li className="flex items-start gap-2"><span className="text-[#2563EB] mt-0.5">•</span>Real-time feed with auto-refresh &amp; live counters</li>
                <li className="flex items-start gap-2"><span className="text-[#2563EB] mt-0.5">•</span>Image uploads, GIF support, YouTube embeds, rich link previews</li>
                <li className="flex items-start gap-2"><span className="text-[#2563EB] mt-0.5">•</span>On-chain follow graph &amp; mutual detection</li>
                <li className="flex items-start gap-2"><span className="text-[#2563EB] mt-0.5">•</span>Profile hover cards (click-to-navigate like X/Twitter)</li>
              </ul>
            </div>

            {/* Messaging */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center"><MessageCircle className="w-4 h-4 text-[#16A34A]" /></div>
                <h3 className="text-sm font-semibold text-[#1A1A2E]">Encrypted Messaging</h3>
              </div>
              <ul className="space-y-1.5 text-[13px] text-[#475569]">
                <li className="flex items-start gap-2"><span className="text-[#16A34A] mt-0.5">•</span>End-to-end encrypted 1:1 chat (NaCl Box)</li>
                <li className="flex items-start gap-2"><span className="text-[#16A34A] mt-0.5">•</span>Key exchange &amp; ciphertext stored on-chain</li>
                <li className="flex items-start gap-2"><span className="text-[#16A34A] mt-0.5">•</span>In-chat SOL payments</li>
                <li className="flex items-start gap-2"><span className="text-[#16A34A] mt-0.5">•</span>Real-time polling with auto-scroll</li>
                <li className="flex items-start gap-2"><span className="text-[#16A34A] mt-0.5">•</span>Nobody can read messages except sender &amp; recipient</li>
              </ul>
            </div>

            {/* Creator Tokens */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#F5F3FF] flex items-center justify-center"><Coins className="w-4 h-4 text-[#7C3AED]" /></div>
                <h3 className="text-sm font-semibold text-[#1A1A2E]">Creator Tokens</h3>
              </div>
              <ul className="space-y-1.5 text-[13px] text-[#475569]">
                <li className="flex items-start gap-2"><span className="text-[#7C3AED] mt-0.5">•</span>Launch personal tokens via Bags SDK with bonding curves</li>
                <li className="flex items-start gap-2"><span className="text-[#7C3AED] mt-0.5">•</span>In-app trading — buy &amp; sell without leaving Shyft</li>
                <li className="flex items-start gap-2"><span className="text-[#7C3AED] mt-0.5">•</span>Fee sharing — creators earn on every trade</li>
                <li className="flex items-start gap-2"><span className="text-[#7C3AED] mt-0.5">•</span>Earnings dashboard with claim flow</li>
              </ul>
            </div>

            {/* Gasless UX */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] flex items-center justify-center"><Wallet className="w-4 h-4 text-[#F59E0B]" /></div>
                <h3 className="text-sm font-semibold text-[#1A1A2E]">Gasless Experience</h3>
              </div>
              <ul className="space-y-1.5 text-[13px] text-[#475569]">
                <li className="flex items-start gap-2"><span className="text-[#F59E0B] mt-0.5">•</span>Treasury-sponsored transactions for all actions</li>
                <li className="flex items-start gap-2"><span className="text-[#F59E0B] mt-0.5">•</span>Users never need to own, buy, or hold SOL</li>
                <li className="flex items-start gap-2"><span className="text-[#F59E0B] mt-0.5">•</span>Privy embedded wallets with silent signing</li>
                <li className="flex items-start gap-2"><span className="text-[#F59E0B] mt-0.5">•</span>No wallet popups, no seed phrases</li>
              </ul>
            </div>
          </div>

          {/* ═══════════ ON-CHAIN PROGRAM ═══════════ */}
          <SectionHeading id="onchain-program" icon={Code2}>On-Chain Program</SectionHeading>
          <div className="mt-4 text-[#475569] leading-relaxed space-y-4 text-[13px]">
            <p>
              Shyft&apos;s Solana program is written in <strong className="text-[#1A1A2E]">Rust</strong> using the <strong className="text-[#1A1A2E]">Anchor Framework</strong>. All social data is stored as PDAs (Program Derived Addresses) — no external database involved.
            </p>
          </div>

          <InfoCard title="Program ID" accent="blue">
            <code className="bg-white px-2 py-1 rounded text-[12px] font-mono text-[#2563EB] border border-[#E2E8F0]">{PROGRAM_ID}</code>
            <span className="ml-2 text-[11px] text-[#94A3B8]">— Solana Devnet</span>
            <a href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline">
              View on Explorer <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </InfoCard>

          <h3 className="text-base font-semibold text-[#1A1A2E] mt-6 mb-3">Instructions</h3>
          <div className="overflow-x-auto">
            <table className="w-full border border-[#E2E8F0] rounded-xl overflow-hidden text-left">
              <thead>
                <TableRow header cells={["Instruction", "Description"]} />
              </thead>
              <tbody>
                <TableRow cells={["create_profile", "Create an on-chain profile with username, display name, bio, and avatar URL"]} />
                <TableRow cells={["update_profile", "Update display name, bio, avatar, and banner image"]} />
                <TableRow cells={["create_post", "Publish a text post (with optional media URLs) permanently on-chain"]} />
                <TableRow cells={["like_post", "Like a post — increments the on-chain like counter"]} />
                <TableRow cells={["create_comment", "Add a comment to a post (stored as a separate PDA)"]} />
                <TableRow cells={["react_to_post", "React with one of six emoji types: ❤️ 🔥 🚀 😂 👏 💡"]} />
                <TableRow cells={["follow_user", "Follow a user — creates an on-chain follow relationship"]} />
                <TableRow cells={["unfollow_user", "Unfollow a user — closes the follow PDA"]} />
                <TableRow cells={["create_chat", "Initialize an encrypted chat channel between two wallets"]} />
                <TableRow cells={["send_message", "Send an E2E encrypted message on-chain in a chat"]} />
              </tbody>
            </table>
          </div>

          <InfoCard title="Payer / Sponsor Architecture" accent="green">
            Every instruction accepts a separate <code className="bg-white px-1.5 py-0.5 rounded text-[12px] font-mono border border-[#E2E8F0]">payer</code> signer so the treasury wallet can cover rent and gas fees while the user only signs to prove ownership of their wallet.
          </InfoCard>

          {/* ═══════════ TREASURY ═══════════ */}
          <SectionHeading id="treasury" icon={Wallet}>Treasury &amp; Gasless UX</SectionHeading>
          <div className="mt-4 text-[#475569] leading-relaxed space-y-4 text-[13px]">
            <p>Users never pay anything. Here&apos;s the full flow:</p>
          </div>

          <div className="mt-4 space-y-3">
            {[
              { step: 1, color: "bg-[#2563EB]", text: "User signs in → Privy creates an embedded Solana wallet (0 SOL balance)" },
              { step: 2, color: "bg-[#2563EB]", text: "User takes an action (post, chat, follow, etc.)" },
              { step: 3, color: "bg-[#7C3AED]", text: "Frontend builds the transaction with feePayer = treasury" },
              { step: 4, color: "bg-[#7C3AED]", text: "User's wallet signs to prove identity (silent signing via Privy)" },
              { step: 5, color: "bg-[#16A34A]", text: "Transaction is sent to the treasury service where it is co-signed" },
              { step: 6, color: "bg-[#16A34A]", text: "Treasury pays both the gas fee (~0.000005 SOL) and account rent (~0.003 SOL)" },
            ].map(({ step, color, text }) => (
              <div key={step} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full ${color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5`}>{step}</div>
                <p className="text-[13px] text-[#475569]">{text}</p>
              </div>
            ))}
          </div>

          <InfoCard title="Cost per user" accent="orange">
            Approximately <strong>~$0.001 USD</strong> per action at current SOL prices (gas + rent). The treasury model enables free usage at scale with minimal cost.
          </InfoCard>

          {/* ═══════════ ENCRYPTION ═══════════ */}
          <SectionHeading id="encryption" icon={Key}>E2E Encryption</SectionHeading>
          <div className="mt-4 text-[#475569] leading-relaxed space-y-4 text-[13px]">
            <p>Shyft&apos;s chat uses military-grade end-to-end encryption. The protocol ensures that <strong className="text-[#1A1A2E]">only the sender and recipient</strong> can ever read a message — not the platform, not any server, not anyone intercepting the blockchain data.</p>
          </div>

          <div className="overflow-x-auto my-6">
            <table className="w-full border border-[#E2E8F0] rounded-xl overflow-hidden text-left">
              <thead>
                <TableRow header cells={["Component", "Technology"]} />
              </thead>
              <tbody>
                <TableRow cells={["Key Derivation", "Wallet signs a deterministic message → SHA-256 → X25519 keypair"]} />
                <TableRow cells={["Key Exchange", "Public keys published on-chain as the first message in each chat"]} />
                <TableRow cells={["Encryption Algorithm", "NaCl Box (X25519-XSalsa20-Poly1305)"]} />
                <TableRow cells={["Nonce", "Random 24-byte nonce per message"]} />
                <TableRow cells={["Storage", "Ciphertext stored on-chain as Solana PDAs"]} />
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-semibold text-[#1A1A2E] mt-6 mb-3">How It Works</h3>
          <div className="space-y-3">
            {[
              { step: "1", title: "Key Derivation", desc: "When a user opens chat for the first time, their wallet signs a deterministic message. The signature is hashed with SHA-256 and used to derive an X25519 encryption keypair. This keypair is unique to the user but deterministic — the same wallet always produces the same keys." },
              { step: "2", title: "Key Exchange", desc: "When a chat is opened with a new contact, each party publishes their X25519 public key as an on-chain message (prefixed with PUBKEY:). This is a one-time operation per chat pair." },
              { step: "3", title: "Shared Secret", desc: "Using Diffie-Hellman key agreement, both parties independently compute the same shared secret from their private key + the peer's public key. Each chat pair has a unique shared secret — Alice's chat with Bob uses a different key than Alice's chat with Carol." },
              { step: "4", title: "Encryption", desc: "Each message is encrypted with NaCl Box using the shared secret and a random 24-byte nonce. The ciphertext (prefixed with ENC:) and nonce are stored on-chain. Only the two participants can decrypt." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[#16A34A] text-white flex items-center justify-center text-[11px] font-bold">{step}</div>
                  <h4 className="text-sm font-semibold text-[#1A1A2E]">{title}</h4>
                </div>
                <p className="text-[13px] text-[#64748B] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* ═══════════ CREATOR TOKENS ═══════════ */}
          <SectionHeading id="creator-tokens" icon={Coins}>Creator Tokens</SectionHeading>
          <div className="mt-4 text-[#475569] leading-relaxed space-y-4 text-[13px]">
            <p>
              Shyft integrates the <strong className="text-[#1A1A2E]">Bags SDK</strong> (<code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded text-[12px] font-mono">@bagsfm/bags-sdk</code>) to enable creator token economies. Tokens run on <strong className="text-[#1A1A2E]">Solana Mainnet</strong> with bonding-curve pricing.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">🚀 Launch</h4>
              <p className="text-[13px] text-[#64748B]">Creators fill out name, symbol, description, and image. The Bags SDK creates a token with bonding-curve pricing — early buyers get lower prices.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">📈 Trade</h4>
              <p className="text-[13px] text-[#64748B]">Fans buy and sell creator tokens directly inside Shyft. Trades happen on Solana Mainnet and settle instantly.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">💰 Earn</h4>
              <p className="text-[13px] text-[#64748B]">Every trade generates a fee. Creators can view and claim their earnings from the Earnings dashboard inside the Tokens tab.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">🔍 Discover</h4>
              <p className="text-[13px] text-[#64748B]">A trending feed shows all tokens launched through Bags. Users can browse, trade, and support creators they believe in.</p>
            </div>
          </div>

          {/* ═══════════ TECH STACK ═══════════ */}
          <SectionHeading id="tech-stack" icon={Layers}>Tech Stack</SectionHeading>
          <div className="overflow-x-auto mt-4">
            <table className="w-full border border-[#E2E8F0] rounded-xl overflow-hidden text-left">
              <thead>
                <TableRow header cells={["Category", "Technology"]} />
              </thead>
              <tbody>
                <TableRow cells={["Blockchain", "Solana (Devnet for social, Mainnet for tokens)"]} />
                <TableRow cells={["Smart Contracts", "Rust, Anchor Framework 0.30"]} />
                <TableRow cells={["Frontend", "Next.js 16, React 19, TypeScript, Tailwind CSS 4"]} />
                <TableRow cells={["Authentication", "Privy (Twitter OAuth, Email, Google, Embedded Wallets)"]} />
                <TableRow cells={["Creator Tokens", "Bags SDK (@bagsfm/bags-sdk)"]} />
                <TableRow cells={["Encryption", "tweetnacl (NaCl Box — X25519 + XSalsa20-Poly1305)"]} />
                <TableRow cells={["RPC", "Helius"]} />
                <TableRow cells={["State Management", "Zustand"]} />
                <TableRow cells={["Charts", "Recharts"]} />
                <TableRow cells={["Icons", "Lucide React"]} />
                <TableRow cells={["Hosting", "Vercel"]} />
              </tbody>
            </table>
          </div>

          {/* ═══════════ FAQ ═══════════ */}
          <SectionHeading id="faq" icon={MessageCircle}>Frequently Asked Questions</SectionHeading>
          <div className="mt-4 bg-white rounded-xl border border-[#E2E8F0] px-5 divide-y divide-[#E2E8F0]">
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="mt-16 pt-8 border-t border-[#E2E8F0]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#16A34A] flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1A1A2E]">Shyft</p>
                  <p className="text-[10px] text-[#94A3B8]">Fully on-chain social built on Solana</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <a href="https://www.shyft.lol" className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">Live App <ExternalLink className="w-3 h-3" /></a>
                <a href="https://x.com/Shyft_lol" target="_blank" rel="noopener noreferrer" className="text-xs text-[#64748B] hover:text-[#1A1A2E] transition-colors">𝕏 Twitter</a>
                <a href="https://github.com/chandm1213/Shyft.lol" target="_blank" rel="noopener noreferrer" className="text-xs text-[#64748B] hover:text-[#1A1A2E] transition-colors">GitHub</a>
              </div>
            </div>
            <p className="text-[10px] text-[#94A3B8] text-center mt-6">
              Program: {PROGRAM_ID} · Solana Devnet · © {new Date().getFullYear()} Shyft
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
