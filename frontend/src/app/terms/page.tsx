import Link from "next/link";
import { Footer } from "@/components/footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-xl mx-auto px-4 py-12 w-full">
      <Link href="/" className="text-white/30 hover:text-white text-sm">&larr; Back</Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">Terms of Use</h1>
      <div className="prose prose-invert prose-sm">
        <p className="text-white/40 text-xs mb-4">Last updated: April 12, 2026</p>
        <p>By using Orryon, you agree to these terms. Orryon is a personal AI assistant for finances, scheduling, and daily life organization.</p>
        <h2>Not Financial Advice</h2>
        <p>Orryon provides tools and insights based on your data. Nothing in the app constitutes financial advice. Always consult a qualified financial advisor for significant financial decisions.</p>
        <h2>Subscription &amp; Billing</h2>
        <p>New accounts receive a <strong>14-day free Pro trial</strong> with full access to all features. After the trial, continued Pro access requires an active subscription ($8/month or $72/year). Subscriptions <strong>automatically renew</strong> at the end of each billing period unless cancelled.</p>
        <p>You may cancel your subscription at any time through Settings &gt; Manage billing. Cancellation takes effect at the end of the current billing period. Refund requests are handled case-by-case at support@orryon.app.</p>
        <h2>Your Data</h2>
        <p>You own your data. Orryon stores your information on secure servers accessible only through your authenticated account. You can export or delete your data at any time from Settings.</p>
        <h2>AI Limitations</h2>
        <p>The AI assistant uses the Grok API (xAI) and aims to be accurate but may occasionally make mistakes. Always verify important financial information.</p>
        <h2>Availability</h2>
        <p>Orryon is provided &quot;as is&quot; without warranties of any kind. We aim for reliability but cannot guarantee 100% uptime. We are not liable for any indirect, incidental, or consequential damages arising from your use of Orryon.</p>
      </div>
    </div>
    <Footer />
    </div>
  );
}
