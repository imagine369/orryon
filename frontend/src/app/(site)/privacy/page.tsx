/* eslint-disable react/no-unescaped-entities -- legal copy with many quoted terms */
import { SiteNav, NavBackLink } from "@/components/site-nav";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col flex-1 bg-black text-white">
    <SiteNav>
      <NavBackLink />
    </SiteNav>
    <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-white/40 text-xs mb-6">Effective Date: May 12, 2026 | Version 3.0</p>
        
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 mb-8">
          <p className="text-sm text-white/80">
            Orryon ("we," "us," or "our") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our Service. It applies to all users and is incorporated into our Terms of Service. By using the Service, you consent to the practices described herein. If you do not agree, do not use the Service.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Information We Collect</h2>
        <p>We collect information necessary to provide, maintain, improve, and secure the Service. Categories of personal information we collect include:</p>
        <ul>
          <li><strong>Account Information</strong>: Email address (for authentication via passwordless OTP, notifications, and account recovery).</li>
          <li><strong>User Data</strong>: Financial records (transactions, budgets, accounts, goals, subscriptions), notes, events, schedules, productivity data, and other content you create or import.</li>
          <li><strong>AI Interaction Data</strong>: Chat messages, conversation history, prompts, and limited context summaries sent to third-party AI providers to maintain coherent sessions.</li>
          <li><strong>Billing Information</strong>: Stripe customer and subscription identifiers (we never store full payment card details or other sensitive payment information).</li>
          <li><strong>Technical &amp; Usage Data</strong>: Device information, IP address, browser type, operating system, access times, pages viewed, error logs, and performance data (used for security, analytics, and service improvement).</li>
          <li><strong>Optional Information</strong>: Any additional data you voluntarily provide (e.g., via support requests, feedback, or surveys).</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use Your Information</h2>
        <p><strong>Orryon uses your data solely to make your experience better.</strong> We use the information we collect to: (a) provide, maintain, and improve the Service for you; (b) authenticate users and prevent fraud or abuse; (c) process payments and manage subscriptions; (d) deliver personalized AI-powered and other features; (e) send transactional emails (OTP codes, billing receipts, optional reminders); (f) analyze usage to enhance features, performance, and user experience; (g) comply with legal obligations; (h) enforce our Terms of Service; and (i) protect the rights, property, and safety of Orryon, our users, and the public. We do not use your data for any other purpose.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Legal Bases for Processing (GDPR, UK GDPR, and Similar Laws)</h2>
        <p>Where applicable (including for users in the European Economic Area, United Kingdom, Switzerland, or California), our legal bases for processing personal information include: (i) performance of a contract with you (providing the Service pursuant to the Terms of Service); (ii) your consent (for optional features, marketing communications, or specific processing activities); (iii) our legitimate interests (including improving the Service, security, fraud prevention, and analytics), provided such interests are not overridden by your data protection rights; and (iv) compliance with legal obligations. You may withdraw consent at any time where processing is based on consent, without affecting the lawfulness of processing based on consent before its withdrawal.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. AI and Third-Party Processing; Subprocessors</h2>
        <p>When you use the AI assistant, your messages and a limited, relevant summary of your data (e.g., recent transactions, current budgets, or active goals) may be transmitted to third-party AI providers such as xAI. We do not transmit your full database or raw financial history. We maintain a list of subprocessors and service providers, which we update from time to time. Current subprocessors include xAI (for AI processing), Stripe (for billing), and optional SMTP providers (for transactional emails you configure). Review xAI's privacy policy at https://x.ai/legal/privacy-policy and Stripe's privacy policy at https://stripe.com/privacy. We require all subprocessors to maintain appropriate confidentiality and security measures.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Sharing and Disclosure of Personal Information; No Sale of Data</h2>
        <p><strong>ORRYON DOES NOT SELL, RENT, LEASE, OR TRADE YOUR PERSONAL INFORMATION OR USER CONTENT TO ANY THIRD PARTY FOR ANY PURPOSE WHATSOEVER.</strong> We keep your data private and use it solely to provide, operate, secure, and improve the Service for your benefit—including delivering personalized AI assistance, financial insights, wellness guidance, and other features you choose to use. We do not use your data for targeted advertising, cross-site tracking, profiling for third parties, or any unrelated commercial purpose.</p>
        <p>We may share personal information only in the following limited circumstances: (a) with service providers and subprocessors (such as xAI for AI processing or Stripe for billing) who perform services on our behalf under strict confidentiality and data protection obligations; (b) to comply with law, valid legal process, or government requests; (c) to protect the rights, property, or safety of Orryon, our users, or the public; (d) in connection with a merger, acquisition, or sale of all or substantially all of our assets (with notice where required by law); or (e) with your explicit consent. Aggregated or de-identified data that cannot identify you may be used for analytics and product improvement.</p>
        <p><strong>NOTWITHSTANDING ANY OTHER PROVISION, ORRYON SHALL HAVE NO LIABILITY FOR ANY THIRD PARTY (INCLUDING SUBPROCESSORS OR OTHER USERS) THAT OBTAINS, MISUSES, OR DISCLOSES YOUR DATA THROUGH MEANS OUTSIDE OUR REASONABLE CONTROL, SUCH AS YOUR OWN SHARING OF DATA, A SECURITY BREACH AT A THIRD-PARTY PROVIDER DESPITE OUR CONTRACTUAL REQUIREMENTS, OR ANY OTHER ACTION BY A PARTY WE DO NOT CONTROL.</strong></p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. International Data Transfers</h2>
        <p>Your information may be transferred to and processed in the United States or other countries where our service providers and subprocessors are located. Where required by applicable law (including GDPR and UK GDPR), we use appropriate safeguards such as Standard Contractual Clauses approved by the European Commission, the UK Information Commissioner's Office, or other lawful transfer mechanisms. By using the Service, you consent to such transfers to the extent permitted by law.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Data Retention</h2>
        <p>We retain personal information for as long as necessary to provide the Service, comply with legal obligations, resolve disputes, enforce agreements, and protect our rights. Upon account deletion, we permanently delete your personal data from active production systems within thirty (30) days, subject to legal holds, fraud investigations, backup retention (typically no longer than ninety (90) days), or requirements under applicable law. Anonymized or aggregated data may be retained indefinitely for analytics and product improvement. You control retention of your local or self-hosted data.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Your Rights and Choices</h2>
        <p>Depending on your location, you may have rights under applicable data protection laws, including the right to access, correct, delete, port, restrict processing of, object to processing of, and (where processing is based on consent) withdraw consent to your personal information. To exercise these rights, use the in-app tools (Export, Delete Account) or contact contact@orryon.com. We will respond to verified requests within the timeframes required by applicable law (typically thirty (30) days). California residents may make CCPA/CPRA requests. EEA/UK users may contact our designated representative if required. Note that deletion will permanently remove your account and data; you cannot later recover it. Some rights may be subject to exceptions or limitations under applicable law.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Data Security</h2>
        <p>We implement reasonable administrative, technical, and physical safeguards designed to protect your personal information, including passwordless OTP + JWT authentication, optional at-rest encryption via ENCRYPTION_KEY (Fernet), HTTPS/TLS for all production traffic, and restricted database access. No security measure is perfect, and we cannot guarantee absolute security. You are responsible for maintaining the confidentiality of your account credentials. We will notify affected users of material security breaches as required by applicable law, without admission of liability.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">10. Children's Privacy</h2>
        <p>The Service is not directed to individuals under the age of thirteen (13) (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal information from children under thirteen (13). If we become aware that we have collected such information, we will delete it promptly. If you believe a child has provided us information, contact contact@orryon.com.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">11. Cookies and Tracking Technologies</h2>
        <p>We use essential cookies and similar technologies for authentication, security, and basic functionality. We do not use cookies for targeted advertising, cross-site tracking, or marketing purposes. You may control cookies through your browser settings, but disabling essential cookies may affect Service functionality.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">12. Data Processing Addendum (DPA)</h2>
        <p>For enterprise or business customers subject to GDPR, UK GDPR, CCPA, or similar data protection laws, Orryon offers a separate Data Processing Addendum (DPA) that sets forth additional contractual terms regarding the processing of personal data. The DPA is available upon request by emailing contact@orryon.com. The DPA supplements this Privacy Policy and the Terms of Service and forms part of the agreement between Orryon and the enterprise customer when executed.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">13. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Material changes will be announced by updating the Effective Date, posting a notice in the Service, or emailing you. Your continued use of the Service after the Effective Date constitutes acceptance of the updated Policy. We encourage you to review this page periodically.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">14. Contact Us</h2>
        <p>If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, contact us at <a href="mailto:contact@orryon.com" className="underline">contact@orryon.com</a>. For formal legal notices, include "Privacy Request" in the subject line.</p>

        <div className="mt-12 p-6 bg-zinc-900 border border-white/10 rounded-2xl">
          <p className="text-sm text-white/70">
            We are committed to protecting your privacy and giving you control over your data. Your trust matters to us.
          </p>
          <p className="text-xs text-white/40 mt-4">
            Questions or concerns? Contact us at <a href="mailto:contact@orryon.com" className="underline hover:text-white">contact@orryon.com</a>.
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}
