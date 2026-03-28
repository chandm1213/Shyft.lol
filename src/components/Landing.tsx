"use client";

import { useState, useEffect } from "react";
import { Shield, MessageCircle, Wallet, Lock, Users, ArrowRight, Zap, Eye, EyeOff, ChevronRight, Sparkles } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const features = [
  {
    icon: Shield,
    title: "On-Chain Posts",
    description: "Your posts live on Solana — permanent, censorship-resistant, and fully owned by you.",
    color: "#2563EB",
    bgColor: "#EFF6FF",
    preview: {
      type: "post",
      author: "You",
      content: "Just shipped a new feature! Posted permanently on Solana...",
      badge: "On-Chain",
    },
  },
  {
    icon: MessageCircle,
    title: "Encrypted Chat",
    description: "Messages routed through MagicBlock's TEE. Not even the app can read your conversations.",
    color: "#16A34A",
    bgColor: "#F0FDF4",
    preview: {
      type: "chat",
      messages: [
        { sender: "Alice", text: "Hey, check out this alpha..." },
        { sender: "You", text: "This is incredible, sending you 5 USDC" },
        { sender: "system", text: "\u{1F4B8} 5 USDC sent privately" },
      ],
    },
  },
  {
    icon: Wallet,
    title: "Stealth Payments",
    description: "Send USDC privately via Private Ephemeral Rollups. On-chain observers see nothing.",
    color: "#2563EB",
    bgColor: "#EFF6FF",
    preview: {
      type: "payment",
      steps: ["Deposit into PER", "Transfer inside TEE", "Recipient withdraws"],
    },
  },
  {
    icon: Users,
    title: "Follow Network",
    description: "Follow anyone on-chain. Build your social graph stored directly on Solana.",
    color: "#16A34A",
    bgColor: "#F0FDF4",
    preview: {
      type: "follows",
      count: "Your network. Your graph.",
    },
  },
];

export default function Landing() {
  const [activeFeature, setActiveFeature] = useState(0);
  const [showApp, setShowApp] = useState(false);

  // Auto-cycle features every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFBFC] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-3 sm:py-4 border-b border-[#E2E8F0] bg-white/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-6xl sm:text-7xl font-black text-[#1F2937]" style={{fontFamily: 'Georgia, serif', fontWeight: '900', lineHeight: '1'}}>
            S
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#1A1A2E]">Shyft</h1>
            <p className="text-[9px] sm:text-[10px] text-[#64748B] -mt-0.5">Private Social</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href="https://explorer.solana.com/address/EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ?cluster=devnet" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1 text-xs text-[#64748B] hover:text-[#2563EB] transition-colors">
            <Zap className="w-3 h-3" /> On-Chain Program
          </a>
          <WalletMultiButton />
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12 md:py-20">
        {/* Badge */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-white border border-[#E2E8F0] rounded-full mb-5 sm:mb-6 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
          <span className="text-[10px] sm:text-xs font-medium text-[#64748B]">Built on Solana with MagicBlock PERs</span>
        </div>

        {/* Title */}
        <h2 className="text-3xl sm:text-4xl md:text-6xl font-bold text-center text-[#1A1A2E] max-w-3xl leading-tight">
          Social that&apos;s{" "}
          <span className="bg-gradient-to-r from-[#2563EB] to-[#16A34A] bg-clip-text text-transparent">
            actually private
          </span>
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-[#64748B] text-center max-w-xl mt-3 sm:mt-4 leading-relaxed px-2">
          Post, chat, and send payments — all encrypted inside hardware-secured TEEs on Solana. Not even we can see your data.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-6 sm:mt-8 w-full sm:w-auto">
          <div className="w-full sm:w-auto flex justify-center">
            <WalletMultiButton />
          </div>
          <button
            onClick={() => {
              const el = document.getElementById("features");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-[#64748B] hover:text-[#1A1A2E] transition-colors"
          >
            See how it works <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Trust bar */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 sm:gap-6 mt-8 sm:mt-12 w-full sm:w-auto justify-center">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-[#94A3B8] justify-center">
            <Lock className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" />
            <span>Intel TDX Encrypted</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-[#94A3B8] justify-center">
            <Shield className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0" />
            <span>On-Chain Permissions</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-[#94A3B8] justify-center">
            <EyeOff className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" />
            <span>Zero-Knowledge Payments</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-[#94A3B8] justify-center">
            <Zap className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0" />
            <span>Real-Time on Solana</span>
          </div>
        </div>
      </div>

      {/* Feature Preview Section */}
      <div id="features" className="px-4 sm:px-6 md:px-12 py-12 sm:py-16 md:py-24 bg-white border-t border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1A1A2E]">
              Everything you love about social.{" "}
              <span className="text-[#64748B]">Nothing you don&apos;t.</span>
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-2 sm:mt-3">Every feature is powered by MagicBlock Private Ephemeral Rollups</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-8 items-start">
            {/* Feature tabs */}
            <div className="space-y-2 sm:space-y-3">
              {features.map((feature, i) => {
                const Icon = feature.icon;
                const isActive = i === activeFeature;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveFeature(i)}
                    className={`touch-active w-full text-left p-3 sm:p-4 rounded-2xl border transition-all duration-300 ${
                      isActive
                        ? "bg-white border-[#2563EB]/20 shadow-lg shadow-blue-100"
                        : "bg-[#F8FAFC] border-[#E2E8F0] hover:bg-white active:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: feature.bgColor }}
                      >
                        <Icon className="w-5 h-5" style={{ color: feature.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1A2E]">{feature.title}</p>
                        <p className={`text-xs mt-1 transition-all duration-300 ${
                          isActive ? "text-[#64748B]" : "text-[#94A3B8]"
                        }`}>
                          {feature.description}
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <div className="mt-3 ml-13 h-1 bg-gradient-to-r from-[#2563EB] to-[#16A34A] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Feature preview card */}
            <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-4 sm:p-6 min-h-[280px] sm:min-h-[360px] flex items-center justify-center">
              {features[activeFeature].preview.type === "post" && (
                <div className="w-full animate-fade-in">
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-lg">{"\u{1F60E}"}</div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1A2E]">You</p>
                        <span className="text-[10px] font-medium text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                          On-Chain
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-[#1A1A2E]">{features[activeFeature].preview.content}</p>
                    <div className="mt-3 pt-3 border-t border-[#F1F5F9] flex items-center gap-3 text-xs text-[#94A3B8]">
                      <span>{"\u2764\uFE0F"} 12</span>
                      <span>{"\u{1F4AC}"} 3</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 justify-center text-[10px] text-[#2563EB]">
                    <Shield className="w-3 h-3" />
                    <span>Stored permanently on Solana — owned by your wallet</span>
                  </div>
                </div>
              )}

              {features[activeFeature].preview.type === "chat" && (
                <div className="w-full space-y-3 animate-fade-in">
                  <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#EBF4FF] flex items-center justify-center text-sm">{"\u{1F469}"}</div>
                      <div>
                        <p className="text-xs font-semibold text-[#1A1A2E]">Alice</p>
                        <p className="text-[10px] text-[#16A34A] flex items-center gap-0.5"><Shield className="w-2 h-2" /> Encrypted via PER</p>
                      </div>
                    </div>
                    <div className="p-4 space-y-2.5">
                      {(features[activeFeature].preview as any).messages.map((msg: any, j: number) => (
                        <div key={j} className={`flex ${msg.sender === "You" ? "justify-end" : "justify-start"}`}>
                          {msg.sender === "system" ? (
                            <div className="bg-gradient-to-r from-[#16A34A] to-[#15803D] text-white px-3 py-2 rounded-xl text-xs font-medium">
                              {msg.text}
                            </div>
                          ) : (
                            <div className={`px-3 py-2 rounded-xl text-xs max-w-[220px] ${
                              msg.sender === "You"
                                ? "bg-[#2563EB] text-white"
                                : "bg-[#F1F5F9] text-[#1A1A2E]"
                            }`}>
                              {msg.text}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {features[activeFeature].preview.type === "payment" && (
                <div className="w-full animate-fade-in">
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Wallet className="w-5 h-5 text-[#2563EB]" />
                      <p className="text-sm font-semibold text-[#1A1A2E]">Private Payment Flow</p>
                    </div>
                    <div className="space-y-3">
                      {(features[activeFeature].preview as any).steps.map((step: string, j: number) => (
                        <div key={j} className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                            j < 2 ? "bg-[#2563EB]" : "bg-[#16A34A]"
                          }`}>
                            {j + 1}
                          </div>
                          <div className="flex-1 bg-[#F8FAFC] rounded-lg px-3 py-2">
                            <p className="text-xs font-medium text-[#1A1A2E]">{step}</p>
                          </div>
                          {j < 2 && <Lock className="w-3 h-3 text-[#16A34A]" />}
                          {j === 2 && <Sparkles className="w-3 h-3 text-[#16A34A]" />}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 bg-[#F0FDF4] rounded-lg p-3">
                      <p className="text-[10px] text-[#15803D]">
                        <strong>What observers see:</strong> Someone deposited. Someone withdrew. Cannot link them together.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {features[activeFeature].preview.type === "follows" && (
                <div className="w-full animate-fade-in">
                  <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-5 h-5 text-[#16A34A]" />
                      <p className="text-sm font-semibold text-[#1A1A2E]">On-Chain Follow Network</p>
                    </div>
                    <div className="space-y-2.5">
                      {["Alice.sol", "Bob.sol", "Charlie.sol"].map((name, j) => (
                        <div key={j} className="flex items-center gap-3 p-2.5 bg-[#F8FAFC] rounded-xl">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#EBF4FF] to-[#E0F2FE] flex items-center justify-center text-sm">
                            {["\u{1F469}", "\u{1F468}", "\u{1F9D1}"][j]}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-[#1A1A2E]">{name}</p>
                            <p className="text-[10px] text-[#94A3B8]">{j === 0 ? "Follows you · Mutual" : j === 1 ? "Following" : "Follows you"}</p>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${j === 0 ? "bg-[#16A34A]" : "bg-[#2563EB]"}`} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-[10px] text-[#64748B]">Follow relationships stored on Solana — your social graph, your data</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="px-4 sm:px-6 md:px-12 py-12 sm:py-16 bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] border-t border-[#E2E8F0]">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-xl sm:text-2xl font-bold text-[#1A1A2E] mb-6 sm:mb-8">How Shyft keeps you private</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E2E8F0] shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-[#2563EB]">1</span>
              </div>
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">Your data goes into a TEE</h4>
              <p className="text-xs text-[#64748B]">Trusted Execution Environment on Intel TDX. Like a vault inside the CPU — no one can peek in.</p>
            </div>
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E2E8F0] shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-[#16A34A]">2</span>
              </div>
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">Permissions live on Solana</h4>
              <p className="text-xs text-[#64748B]">You decide who sees what via MagicBlock&apos;s Permission Program. Bitmask-level access control.</p>
            </div>
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E2E8F0] shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-[#2563EB]">3</span>
              </div>
              <h4 className="text-sm font-semibold text-[#1A1A2E] mb-2">Only you hold the keys</h4>
              <p className="text-xs text-[#64748B]">Your wallet = your identity. No email, no phone, no KYC. Connect and you&apos;re in.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="px-4 sm:px-6 md:px-12 py-12 sm:py-16 text-center bg-white border-t border-[#E2E8F0]">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#16A34A] flex items-center justify-center mx-auto mb-5 sm:mb-6">
          <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
        </div>
        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1A1A2E] mb-3">Ready to take back your privacy?</h3>
        <p className="text-xs sm:text-sm text-[#64748B] mb-6 sm:mb-8 max-w-md mx-auto">Connect your Solana wallet and start using the first truly private social platform.</p>
        <WalletMultiButton />
        <p className="text-[10px] text-[#94A3B8] mt-4">
          Program: EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ · Devnet
        </p>
      </div>

      {/* Footer */}
      <footer className="px-4 sm:px-6 md:px-12 py-5 sm:py-6 border-t border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#16A34A] flex items-center justify-center">
              <Shield className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-[#64748B]">Shyft</span>
          </div>
          <p className="text-[9px] sm:text-[10px] text-[#94A3B8] text-center">Built with MagicBlock Private Ephemeral Rollups on Solana</p>
        </div>
      </footer>
    </div>
  );
}
