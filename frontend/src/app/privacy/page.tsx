import { Footer } from "@/components/footer";
import { BackButton } from "@/components/back-button";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
      <BackButton />
      <h1 className="text-3xl font-bold mt-4 mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-white/40 text-xs mb-6">Effective Date: May 12, 2026 | Version 2.0</p>
        
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 mb-8">
          <p className="text-sm text-white/80">
            Orryon ("we," "us," or "our") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our Service. It applies to all users and is incorporated into our Terms of Service. By using the Service, you consent to the practices described herein.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Information We Collect</h2>
        <p>We collect information necessary to provide and improve the Service. Categories include:</p>
        <ul>
          <li><strong>Account Information</strong>: Email address (for authentication via passwordless OTP, notifications, and account recovery).</li>
          <li><strong>User Data</strong>: Financial records (transactions, budgets, accounts, goals, subscriptions), notes, events, schedules, productivity data, and other content you create or import.</li>
          <li><strong>AI Interaction Data</strong>: Chat messages, conversation history, prompts, and limited context summaries sent to third-party AI providers to maintain coherent sessions.</li>
          <li><strong>Billing Information</strong>: Stripe customer and subscription identifiers (we never store full payment card details).</li>
          <li><strong>Technical &amp; Usage Data</strong>: Device information, IP address, browser type, operating system, access times, pages viewed, and error logs (used for security, analytics, and service improvement).</li>
          <li><strong>Optional Information</strong>: Any additional data you voluntarily provide (e.g., via support requests or feedback).</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use Your Information</h2>
        <p>We use the information we collect to: (a) provide, maintain, and improve the Service; (b) authenticate users and prevent fraud; (c) process payments and manage subscriptions; (d) deliver AI-powered features; (e) send transactional emails (OTP codes, billing receipts, optional reminders); (f) analyze usage to enhance features and performance; (g) comply with legal obligations; and (h) enforce our Terms of Service.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Legal Bases for Processing (GDPR &amp; Similar Laws)</h2>
        <p>Where applicable (e.g., for users in the EEA, UK, or California), our legal bases for processing include: (i) performance of a contract with you (providing the Service); (ii) your consent (for optional features or marketing); (iii) our legitimate interests (improving the Service, security, fraud prevention); and (iv) compliance with legal obligations. You may withdraw consent at any time where processing is based on consent.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. AI and Third-Party Processing</h2>
        <p>When you use the AI assistant, your messages and a limited, relevant summary of your data (e.g., recent transactions, current budgets, or active goals) may be transmitted to third-party AI providers such as xAI (Grok API). We do not transmit your full database or raw financial history. Review xAI's privacy policy at https://x.ai/legal/privacy-policy. Stripe processes all billing; review Stripe's privacy policy at https://stripe.com/privacy. Optional SMTP providers handle transactional emails you configure. We maintain an up-to-date list of subprocessors upon request.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Sharing and Disclosure</h2>
        <p>We do not sell your personal information. We may share information: (a) with service providers and subprocessors who perform services on our behalf under confidentiality obligations; (b) to comply with law, legal process, or government requests; (c) to protect our rights, property, or safety or that of others; (d) in connection with a merger, acquisition, or sale of assets (with notice); or (e) with your consent. Aggregated or de-identified data that does not identify you may be used or shared for analytics or product improvement.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. International Data Transfers</h2>
        <p>Your information may be transferred to and processed in the United States or other countries where our service providers are located. Where required, we use appropriate safeguards such as Standard Contractual Clauses approved by the European Commission or other lawful transfer mechanisms. By using the Service, you consent to such transfers.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Data Retention</h2>
        <p>We retain your information for as long as necessary to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. Upon account deletion, we permanently delete your personal data from active systems within thirty (30) days, subject to legal holds, fraud investigations, or backup retention (typically no longer than 90 days). Anonymized or aggregated data may be retained indefinitely for analytics. You control retention of your local/self-hosted data.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Your Rights and Choices</h2>
        <p>Depending on your location, you may have rights including: access, correction, deletion, portability, restriction of processing, objection, and withdrawal of consent. To exercise these rights, use the in-app tools (Export, Delete Account) or contact support@orryon.com. We will respond within the timeframes required by law (typically 30 days). California residents may make CCPA requests; EEA/UK users may contact our designated representative if required. Note that deletion will permanently remove your account and data; you cannot later recover it.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Data Security</h2>
        <p>We implement reasonable administrative, technical, and physical safeguards, including: passwordless OTP + JWT authentication, optional at-rest encryption via ENCRYPTION_KEY (Fernet), HTTPS/TLS for all production traffic, and restricted database access. No security measure is perfect; you are responsible for maintaining the confidentiality of your account credentials. We will notify affected users of material security breaches as required by applicable law.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">10. Children's Privacy</h2>
        <p>The Service is not directed to individuals under the age of 13 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will delete it promptly. If you believe a child has provided us information, contact support@orryon.com.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">11. Cookies and Tracking</h2>
        <p>We use essential cookies and similar technologies for authentication, security, and basic functionality. We do not use cookies for targeted advertising or cross-site tracking. You may control cookies through your browser settings, but disabling them may affect Service functionality.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">12. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Material changes will be announced by updating the Effective Date, posting a notice in the Service, or emailing you. Your continued use of the Service after the Effective Date constitutes acceptance of the updated Policy. We encourage you to review this page periodically.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">13. Contact Us</h2>
        <p>If you have questions, concerns, or requests regarding this Privacy Policy or your data, contact us at <a href="mailto:support@orryon.com" className="underline">support@orryon.com</a>. For formal legal notices, include "Privacy Request" in the subject line.</p>

        <div className="mt-12 p-6 bg-zinc-900 border border-white/10 rounded-2xl">
          <p className="text-sm text-white/70">
            We are committed to protecting your privacy and giving you control over your data. Your trust matters to us.
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
