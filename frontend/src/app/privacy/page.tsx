import Link from "next/link";
import { Footer } from "@/components/footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-xl mx-auto px-4 py-12 w-full">
      <Link href="/" className="text-white/30 hover:text-white text-sm">&larr; Back</Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm">
        <p className="text-white/40 text-xs mb-4">Last updated: April 12, 2026</p>
        <p>Orryon is a privacy-focused personal finance and productivity tool. Your financial data is stored in an encrypted database on our servers, accessible only through your authenticated account. We do not sell, share, or monetize your data.</p>
        <h2>Data We Collect</h2>
        <p>We collect only what you provide: your email address for authentication, the financial data you enter through conversations or manual input, and your chat messages for conversation history.</p>
        <h2>AI Processing</h2>
        <p>When you chat with Orryon, your message and a summary of your current financial context are sent to the Grok AI API (xAI) for processing. No raw database exports or full history are shared. Review xAI&apos;s <a href="https://x.ai/legal/privacy-policy" className="underline">privacy policy</a>.</p>
        <h2>Payments</h2>
        <p>Subscription payments are handled entirely by Stripe. We never see or store your credit card number. See Stripe&apos;s <a href="https://stripe.com/privacy" className="underline">privacy policy</a>.</p>
        <h2>Data Storage &amp; Security</h2>
        <p>Your data is stored in a secure SQLite database on our servers. Authentication uses JWT tokens, OTP codes are SHA-256 hashed, and all production connections use HTTPS.</p>
        <h2>Your Rights</h2>
        <p>You can export all your data at any time from Settings. You can permanently delete your account and all data from Settings. When you delete your account, all associated data is removed from our servers.</p>
        <h2>Email</h2>
        <p>We send only: OTP sign-in codes, daily digests, and event reminders (if enabled). No marketing emails, ever.</p>
        <h2>What We Don&apos;t Do</h2>
        <p>No tracking. No analytics cookies. No selling data. No third-party marketing.</p>
      </div>
    </div>
    <Footer />
    </div>
  );
}
