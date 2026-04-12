import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Link href="/" className="text-white/30 hover:text-white text-sm">← Back</Link>
      <h1 className="text-3xl font-bold mt-4 mb-6">Terms of Use</h1>
      <div className="prose prose-invert prose-sm">
        <p>By using orryon, you agree to these terms. orryon is a personal AI assistant for finances, scheduling, and daily life organization.</p>
        <h2>Not Financial Advice</h2>
        <p>orryon provides tools and insights based on your data. Nothing in the app constitutes financial advice. Always consult a qualified financial advisor for significant financial decisions.</p>
        <h2>Your Data</h2>
        <p>You own your data. orryon stores everything locally. You can export or delete your data at any time.</p>
        <h2>AI Limitations</h2>
        <p>The AI assistant aims to be accurate but may occasionally make mistakes. Always verify important financial information.</p>
        <h2>Availability</h2>
        <p>orryon is provided as-is. We aim for reliability but cannot guarantee 100% uptime.</p>
      </div>
    </div>
  );
}
