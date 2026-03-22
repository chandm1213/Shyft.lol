"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Shield, Lock, Send, DollarSign, ExternalLink, Eye, EyeOff, ChevronDown, Wallet, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { usePrivatePayment } from "@/hooks/usePrivatePayment";
import { useProgram } from "@/hooks/useProgram";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Payments() {
  const { payments, isConnected } = useAppStore();
  const [showSendForm, setShowSendForm] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const { sendPayment, step: paymentStep, error: paymentError, txSignature, reset: resetPayment } = usePrivatePayment();
  const program = useProgram();

  const totalSent = payments.filter((p) => p.sender === "me").reduce((sum, p) => sum + p.amount, 0);
  const totalReceived = payments.filter((p) => p.recipient === "me").reduce((sum, p) => sum + p.amount, 0);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-[#2563EB]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">Private Payments</h3>
          <p className="text-sm text-[#64748B]">Connect your wallet to send and receive private payments</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2563EB]" />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-[#64748B]">Total Sent</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[#1A1A2E]">{totalSent.toFixed(2)} <span className="text-xs sm:text-sm font-medium text-[#64748B]">SOL</span></p>
          <p className="text-[10px] text-[#16A34A] flex items-center gap-1 mt-1">
            <Shield className="w-2.5 h-2.5" /> All transfers private
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 sm:p-5">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#F0FDF4] flex items-center justify-center">
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#16A34A]" />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-[#64748B]">Received</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[#1A1A2E]">{totalReceived.toFixed(2)} <span className="text-xs sm:text-sm font-medium text-[#64748B]">SOL</span></p>
          <p className="text-[10px] text-[#16A34A] flex items-center gap-1 mt-1">
            <Shield className="w-2.5 h-2.5" /> Received privately
          </p>
        </div>
      </div>

      {/* Send Payment */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
        <button
          onClick={() => setShowSendForm(!showSendForm)}
          className="touch-active w-full flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-[#F8FAFC] active:bg-[#F1F5F9] transition-colors"
        >
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#16A34A] flex items-center justify-center flex-shrink-0">
              <Send className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-[#1A1A2E]">Send Private Payment</p>
              <p className="text-[10px] sm:text-[11px] text-[#64748B]">Send SOL to friends on Solana</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition-transform flex-shrink-0 ${showSendForm ? "rotate-180" : ""}`} />
        </button>

        {showSendForm && (
          <div className="px-3.5 sm:px-5 pb-4 sm:pb-5 space-y-3 animate-fade-in border-t border-[#F1F5F9]">
            <div className="pt-4">
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Recipient Address</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#64748B] mb-1.5 block">Amount</label>
              <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5">
                <DollarSign className="w-4 h-4 text-[#94A3B8]" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
                <span className="text-xs font-medium text-[#64748B]">SOL</span>
              </div>
            </div>

            {/* Payment Flow visualization */}
            <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">Payment Flow</p>
              <div className="flex items-center gap-2 text-xs text-[#475569]">
                <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Send SOL directly on Solana</span>
                <Lock className="w-3 h-3 text-[#16A34A] ml-auto" />
              </div>
              <div className="flex items-center gap-2 text-xs text-[#475569]">
                <span className="w-5 h-5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Record payment on-chain</span>
                <Lock className="w-3 h-3 text-[#16A34A] ml-auto" />
              </div>
              <div className="flex items-center gap-2 text-xs text-[#475569]">
                <span className="w-5 h-5 rounded-full bg-[#16A34A] text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Create MagicBlock permission &amp; delegate to TEE</span>
                <Shield className="w-3 h-3 text-[#16A34A] ml-auto" />
              </div>
            </div>

            {/* Payment Status */}
            {paymentStep !== "idle" && paymentStep !== "done" && paymentStep !== "error" && (
              <div className="bg-[#EFF6FF] rounded-xl p-4 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-[#2563EB]">
                    {paymentStep === "sending" && "Sending SOL payment..."}
                    {paymentStep === "confirming" && "Confirming transaction..."}
                    {paymentStep === "recording" && "Recording payment on-chain..."}
                    {paymentStep === "delegating" && "Delegating to MagicBlock TEE..."}
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className={`h-1.5 flex-1 rounded-full ${["sending", "confirming", "recording", "delegating"].includes(paymentStep) ? "bg-[#2563EB]" : "bg-[#E2E8F0]"}`} />
                  <div className={`h-1.5 flex-1 rounded-full ${["confirming", "recording", "delegating"].includes(paymentStep) ? "bg-[#7C3AED]" : "bg-[#E2E8F0]"}`} />
                  <div className={`h-1.5 flex-1 rounded-full ${["recording", "delegating"].includes(paymentStep) ? "bg-[#7C3AED]" : "bg-[#E2E8F0]"}`} />
                  <div className={`h-1.5 flex-1 rounded-full ${paymentStep === "delegating" ? "bg-[#16A34A]" : "bg-[#E2E8F0]"}`} />
                </div>
              </div>
            )}

            {paymentStep === "done" && txSignature && (
              <div className="bg-[#F0FDF4] rounded-xl p-4 animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-[#16A34A] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-[#15803D]">Payment Sent &amp; Protected by MagicBlock TEE!</span>
                </div>
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#2563EB] hover:underline flex items-center gap-1"
                >
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
                <button onClick={resetPayment} className="mt-2 text-xs text-[#64748B] hover:text-[#1A1A2E]">
                  Send another payment
                </button>
              </div>
            )}

            {paymentStep === "error" && paymentError && (
              <div className="bg-red-50 rounded-xl p-4 animate-fade-in">
                <p className="text-sm text-red-600 font-medium">Payment failed</p>
                <p className="text-xs text-red-500 mt-1">{paymentError}</p>
                <button onClick={resetPayment} className="mt-2 text-xs text-[#2563EB] hover:underline">
                  Try again
                </button>
              </div>
            )}

            <button
              onClick={() => sendPayment(recipient, parseFloat(amount), program)}
              disabled={!recipient || !amount || !["idle", "done", "error"].includes(paymentStep)}
              className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#16A34A] text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {["sending", "confirming", "recording", "delegating"].includes(paymentStep)
                ? paymentStep === "recording" ? "Recording on-chain..."
                  : paymentStep === "delegating" ? "Delegating to TEE..."
                  : "Processing..."
                : "Send Payment"}
            </button>
            <p className="text-[10px] text-center text-[#94A3B8] flex items-center justify-center gap-1">
              <Shield className="w-2.5 h-2.5" /> Payment record is protected by MagicBlock TEE
            </p>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F8FAFC] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] flex items-center justify-center">
              <Eye className="w-4 h-4 text-[#2563EB]" />
            </div>
            <p className="text-sm font-semibold text-[#1A1A2E]">How Private Payments Work</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition-transform ${showHowItWorks ? "rotate-180" : ""}`} />
        </button>

        {showHowItWorks && (
          <div className="px-5 pb-5 border-t border-[#F1F5F9] pt-4 animate-fade-in">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#2563EB]">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">Direct SOL Transfer</p>
                  <p className="text-xs text-[#64748B] mt-0.5">SOL is sent directly to your friend&apos;s wallet on Solana. Fast, secure, and cost-effective.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#2563EB]">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">Payment Recorded On-Chain</p>
                  <p className="text-xs text-[#64748B] mt-0.5">The payment is recorded as a message in your chat with MagicBlock permissions restricting access to participants only.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#16A34A]">3</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">Message Delegated to TEE</p>
                  <p className="text-xs text-[#64748B] mt-0.5">The payment message PDA is delegated to MagicBlock&apos;s Trusted Execution Environment, protecting the payment record inside Intel TDX hardware.</p>
                </div>
              </div>
              <div className="bg-[#F8FAFC] rounded-xl p-3 mt-2">
                <p className="text-xs text-[#64748B]">
                  <span className="font-semibold text-[#1A1A2E]">MagicBlock TEE Protection:</span> Payment records are delegated to TEE hardware, ensuring only <span className="text-[#16A34A] font-medium">chat participants can see payment details</span>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0]">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#F1F5F9]">
          <h3 className="text-sm font-semibold text-[#1A1A2E]">Transaction History</h3>
          <p className="text-[10px] sm:text-[11px] text-[#64748B]">Payment records protected by MagicBlock TEE</p>
        </div>
        <div className="divide-y divide-[#F1F5F9]">
          {payments.map((payment) => {
            const isSent = payment.sender === "me";
            return (
              <div key={payment.id} className="flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-3 sm:py-3.5 hover:bg-[#F8FAFC] transition-colors">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isSent ? "bg-[#EFF6FF]" : "bg-[#F0FDF4]"
                }`}>
                  {isSent ? (
                    <ArrowUpRight className="w-4 h-4 text-[#2563EB]" />
                  ) : (
                    <ArrowDownLeft className="w-4 h-4 text-[#16A34A]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#1A1A2E]">
                      {isSent ? "Sent" : "Received"} {payment.amount} {payment.token}
                    </p>
                    {payment.isPrivate && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-[#16A34A] bg-[#F0FDF4] px-1.5 py-0.5 rounded-full">
                        <Lock className="w-2 h-2" /> Private
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#94A3B8]">
                    {isSent ? `To: ${payment.recipient}` : `From: ${payment.sender}`} · {timeAgo(payment.timestamp)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${isSent ? "text-[#1A1A2E]" : "text-[#16A34A]"}`}>
                    {isSent ? "-" : "+"}{payment.amount}
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    payment.status === "completed"
                      ? "bg-[#F0FDF4] text-[#16A34A]"
                      : "bg-[#FEF3C7] text-[#D97706]"
                  }`}>
                    {payment.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
