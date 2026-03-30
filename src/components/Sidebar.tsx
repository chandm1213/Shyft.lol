"use client";

import { Shield, Newspaper, MessageCircle, Wallet, User, Lock, BarChart3, Users, Sun, Moon, Coins } from "lucide-react";
import { useAppStore } from "@/lib/store";

const navItems = [
  { id: "feed", label: "Feed", icon: Newspaper },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "friends", label: "People", icon: Users },
  { id: "tokens", label: "Tokens", icon: Coins },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "profile", label: "Profile", icon: User },
];

export default function Sidebar() {
  const { activeTab, setActiveTab, setViewingProfile, conversations, theme, toggleTheme } = useAppStore();
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const handleNavClick = (tabId: string) => {
    if (tabId === "profile") setViewingProfile(null); // always show own profile from nav
    setActiveTab(tabId);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-white border-r border-[#E2E8F0] fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#E2E8F0]">
        <div className="text-7xl font-black text-[#1F2937]" style={{fontFamily: 'Georgia, serif', fontWeight: '900', lineHeight: '1'}}>
          S
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#1A1A2E]">Shyft</h1>
          <p className="text-xs text-[#64748B]">On-Chain Social</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[#2563EB] text-white shadow-md shadow-blue-200"
                  : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1A1A2E]"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.id === "chat" && totalUnread > 0 && (
                <span className="ml-auto bg-[#16A34A] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {totalUnread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="px-4 py-2 border-t border-[#E2E8F0]">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1A1A2E] transition-all duration-200"
        >
          {theme === "light" ? (
            <><Moon className="w-5 h-5" /><span>Night Mode</span></>
          ) : (
            <><Sun className="w-5 h-5 text-[#F59E0B]" /><span>Day Mode</span></>
          )}
        </button>
      </div>

      {/* X / Twitter */}
      <div className="px-4 py-2 border-t border-[#E2E8F0]">
        <a
          href="https://x.com/Shyft_lol"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1A1A2E] transition-all duration-200"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>Follow on X</span>
        </a>
      </div>

      {/* Privacy status */}
      <div className="px-4 py-4 border-t border-[#E2E8F0]">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F0FDF4] rounded-xl">
          <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A] animate-pulse-green" />
          <div>
            <p className="text-xs font-semibold text-[#15803D]">On-Chain Social</p>
            <p className="text-[10px] text-[#16A34A]">Solana Devnet</p>
          </div>
          <Lock className="w-3.5 h-3.5 text-[#16A34A] ml-auto" />
        </div>
      </div>
    </aside>
  );
}
