import Link from "next/link";
import { Footer } from "@/components/footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-xl mx-auto px-4 py-12 w-full">
      <Link href="/" className="text-white/30 hover:text-white text-sm">← Back</Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm">
        <p>orryon is designed with privacy at its core. All your financial data stays local in a SQLite database on your device or server. No data is sent to third parties unless you explicitly enable integrations.</p>
        <h2>Data Collection</h2>
        <p>We collect only what you provide: email for authentication, and the financial data you enter through conversations. No tracking, no analytics, no cookies.</p>
        <h2>AI Processing</h2>
        <p>When you chat with orryon, your messages are processed by the Grok AI API (xAI). Only the current conversation context is sent — no historical data is shared.</p>
        <h2>Data Storage</h2>
        <p>All data is stored in a local SQLite file. You can export or delete your data at any time from Settings.</p>
        <h2>Email</h2>
        <p>If SMTP is configured, we send only: OTP codes, daily digests, and event reminders. No marketing emails, ever.</p>
      </div>
    </div>
    <Footer />
    </div>
  );
}
