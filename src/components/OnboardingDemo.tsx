"use client";

import { useState, useEffect } from "react";
import { ChevronRight, X, Lock, MessageCircle, Zap, User, Shield } from "lucide-react";

interface OnboardingDemoProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 1,
    title: "Welcome to Shyft",
    subtitle: "Private Social on Solana",
    description: "Experience the future of encrypted social networking",
    icon: Shield,
    gradient: "from-[#2563EB] to-[#1D4ED8]",
    accentColor: "bg-blue-50",
    highlightText: "Powered by MagicBlock PERs",
  },
  {
    id: 2,
    title: "Encrypted Feed",
    subtitle: "Share Privately",
    description: "Post your thoughts on-chain for everyone to see. Build your social graph with followers and following.",
    icon: Lock,
    gradient: "from-[#2563EB] to-[#16A34A]",
    accentColor: "bg-blue-50",
    features: ["Public Posts", "On-Chain Social", "Session Keys"],
  },
  {
    id: 3,
    title: "Encrypted Messaging",
    subtitle: "Chat Securely",
    description: "Send messages that only you and your recipient can read. Complete privacy guaranteed.",
    icon: MessageCircle,
    gradient: "from-[#16A34A] to-[#15803D]",
    accentColor: "bg-green-50",
    features: ["E2E Encrypted", "Message History", "Secure Transfers"],
  },
  {
    id: 4,
    title: "Private Payments",
    subtitle: "Transact Privately",
    description: "Send payments without exposing transaction details to the public blockchain.",
    icon: Zap,
    gradient: "from-[#F59E0B] to-[#D97706]",
    accentColor: "bg-amber-50",
    features: ["Hidden Amounts", "Private Recipients", "Instant Settlement"],
  },
  {
    id: 5,
    title: "On-Chain Identity",
    subtitle: "Your Profile",
    description: "Build your reputation on-chain while maintaining privacy where it matters.",
    icon: User,
    gradient: "from-[#EC4899] to-[#BE185D]",
    accentColor: "bg-pink-50",
    features: ["Verifiable Profile", "Follow Network", "Privacy Controls"],
  },
  {
    id: 6,
    title: "Ready to Begin?",
    subtitle: "Join the Private Revolution",
    description: "Start sharing, chatting, and transacting with complete privacy and control.",
    icon: Shield,
    gradient: "from-[#2563EB] to-[#16A34A]",
    accentColor: "bg-gradient-to-r from-blue-50 to-green-50",
    cta: true,
  },
];

export default function OnboardingDemo({ onComplete }: OnboardingDemoProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slide = slides[currentSlide];
  const Icon = slide.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentSlide < slides.length - 1) {
        setCurrentSlide(currentSlide + 1);
      } else {
        onComplete();
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [currentSlide, onComplete]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close onboarding"
        >
          <X className="w-6 h-6 text-gray-600" />
        </button>

        {/* Content */}
        <div className="relative min-h-[500px] flex flex-col">
          {/* Gradient Background */}
          <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} opacity-5`} />

          {/* Main Content */}
          <div className="relative flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
            {/* Icon */}
            <div className={`w-20 h-20 rounded-2xl ${slide.accentColor} flex items-center justify-center mb-6 animate-fade-in`}>
              <Icon className={`w-10 h-10 text-transparent bg-gradient-to-br ${slide.gradient} bg-clip-text`} />
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A2E] mb-2 animate-fade-in">
              {slide.title}
            </h1>

            {/* Subtitle */}
            <p className={`text-lg font-semibold bg-gradient-to-r ${slide.gradient} text-transparent bg-clip-text mb-4 animate-fade-in`}>
              {slide.subtitle}
            </p>

            {/* Description */}
            <p className="text-[#64748B] text-lg mb-8 max-w-md animate-fade-in">
              {slide.description}
            </p>

            {/* Features List */}
            {slide.features && (
              <div className="space-y-3 mb-8 w-full max-w-sm">
                {slide.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${slide.gradient}`} />
                    <span className="text-[#1A1A2E] font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Highlight Text */}
            {slide.highlightText && (
              <div className="inline-block px-4 py-2 bg-gradient-to-r from-blue-100 to-green-100 rounded-full mb-8">
                <p className="text-sm font-semibold text-[#1A1A2E]">{slide.highlightText}</p>
              </div>
            )}
          </div>

          {/* Progress & Controls */}
          <div className="relative border-t border-gray-200 px-8 py-6 bg-gray-50/50">
            {/* Progress Dots */}
            <div className="flex justify-center gap-2 mb-6">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goToSlide(idx)}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentSlide
                      ? `h-3 w-8 bg-gradient-to-r ${slide.gradient}`
                      : "h-2.5 w-2.5 bg-gray-300 hover:bg-gray-400"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            {/* Slide Counter */}
            <p className="text-center text-sm text-[#64748B] mb-6">
              {currentSlide + 1} of {slides.length}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={onComplete}
                className="px-6 py-2.5 rounded-lg text-[#64748B] font-semibold hover:bg-gray-200 transition-colors"
              >
                Skip
              </button>

              {currentSlide < slides.length - 1 && (
                <button
                  onClick={handleNext}
                  className={`px-8 py-2.5 rounded-lg bg-gradient-to-r ${slide.gradient} text-white font-semibold hover:shadow-lg transition-all flex items-center gap-2`}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {currentSlide === slides.length - 1 && (
                <button
                  onClick={onComplete}
                  className={`px-8 py-2.5 rounded-lg bg-gradient-to-r ${slide.gradient} text-white font-semibold hover:shadow-lg transition-all flex items-center gap-2`}
                >
                  Start Exploring <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Auto-play Indicator */}
            {currentSlide < slides.length - 1 && (
              <div className="mt-4 text-center text-xs text-[#94A3B8]">
                Slides advance automatically
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
