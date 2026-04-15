import Link from "next/link";
import { Footer } from "@/components/footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
      <Link href="/" className="text-white/30 hover:text-white text-sm">&larr; Back</Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-white/40 text-xs mb-6">Last updated: April 12, 2026</p>
        
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 mb-8">
          <p className="text-sm text-white/80">
            We built Orryon with a strong focus on privacy and user control. Your data belongs to you. 
            This policy explains how we handle data for our paid subscription service.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">Our Philosophy</h2>
        <p>Orryon requires a paid subscription after the 14-day free trial. We are committed to protecting your data and being transparent about how it is used. We do not sell or monetize your personal information.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Data Collection</h2>
        <ul>
          <li><strong>Account Information</strong>: Email address for authentication and notifications.</li>
          <li><strong>Your Data</strong>: Transactions, budgets, goals, notes, events, schedules, subscriptions, and other records you create.</li>
          <li><strong>AI Chat History</strong>: Messages and conversation context (to maintain coherent conversations with the AI).</li>
          <li><strong>Billing Metadata</strong>: Stripe customer and subscription information (we never store credit card details).</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-3">AI and Wellness Features</h2>
        <p>When you use the AI assistant, your message and a limited summary of relevant context may be sent to xAI&apos;s Grok API. We do not send your full database or raw financial records.</p>
        <p>The Breathe and Meditation features are for general wellness and relaxation. Please see our <a href="/terms" className="underline">Terms of Service</a> for important disclaimers about these features.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Third Parties</h2>
        <ul>
          <li><strong>xAI Grok</strong>: Powers the AI. See their <a href="https://x.ai/legal/privacy-policy" className="underline">privacy policy</a>.</li>
          <li><strong>Stripe</strong>: Handles all subscription billing securely. We never store your payment information.</li>
          <li><strong>SMTP (Optional)</strong>: Used only for transactional emails if you configure it.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-3">Data Security</h2>
        <ul>
          <li>Secure authentication with OTP and JWT tokens</li>
          <li>Optional at-rest encryption with <code>ENCRYPTION_KEY</code></li>
          <li>All traffic uses HTTPS in production</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-3">Your Rights</h2>
        <ul>
          <li>Export all your data anytime (ZIP with SQLite database + JSON)</li>
          <li>Permanently delete your account and all data (this is also how you cancel your subscription)</li>
        </ul>

        <div className="mt-12 p-6 bg-zinc-900 border border-white/10 rounded-2xl">
          <p className="text-sm text-white/70">
            We genuinely want Orryon to be a helpful, privacy-first tool for you. Your trust matters to us.
          </p>
          <p className="text-xs text-white/40 mt-4">
            Questions or concerns? Contact us at <a href="mailto:support@orryon.com" className="underline hover:text-white">support@orryon.com</a>.
          </p>
        </div>
      </div>
    </div>
    <Footer />
    </div>
  );
}
