import { Footer } from "@/components/footer";
import { BackButton } from "@/components/back-button";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
      <BackButton />
      <h1 className="text-3xl font-bold mt-4 mb-6">Terms of Service</h1>
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-white/40 text-xs mb-6">Last updated: May 12, 2026</p>
        
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 mb-8">
          <p className="text-sm text-white/80">
            Thank you for using Orryon. We built this app to genuinely help you manage your life with the support of AI.<br/><br/>
            <strong>Important:</strong> Orryon is not a financial advisor, lawyer, accountant, doctor, or therapist. This includes all AI features and the Breathe/Meditation exercises. 
            Use everything at your own risk and consult qualified professionals for important decisions.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Not Professional Advice</h2>
        <p>All content, forecasts, budgets, suggestions, AI responses, and wellness features (including guided breathing and meditation) are provided for informational, organizational, and general wellness purposes only.</p>
        <p>The Breathe and Meditation features are not medical treatment or therapy. If you have any medical condition, please consult a qualified healthcare professional before using them.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. AI and Feature Limitations</h2>
        <p>The AI assistant uses xAI&apos;s Grok and may occasionally be inaccurate. Always verify important information independently. You use all features of Orryon at your own risk.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Subscription &amp; Billing</h2>
        <p>New users on monthly plans receive a 14-day free trial (annual plans are charged immediately). After the trial, continued access requires a paid subscription processed by Stripe. Subscriptions renew automatically unless cancelled.</p>
        <p className="mt-3">Current plan pricing:</p>
        <ul className="mt-2 space-y-1">
          <li><strong>Starter</strong> — Free forever (breathing &amp; meditation features)</li>
          <li><strong>Pro</strong> — $22/month or $198/year ($16.50/mo)</li>
          <li><strong>Premium</strong> — $33/month or $297/year ($24.75/mo)</li>
          <li><strong>Premium Plus</strong> — $44/month or $396/year ($33/mo)</li>
        </ul>
        <p className="mt-3">To cancel your subscription, sign in to Orryon and use the billing portal under Settings → Manage Billing. You may also cancel directly via your Stripe billing portal. Refund requests are considered on a case-by-case basis — contact us at <a href="mailto:support@orryon.com" className="underline">support@orryon.com</a>.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. Your Data &amp; Privacy</h2>
        <p>You own your data. We provide full export and account deletion tools. See our <a href="/privacy" className="underline">Privacy Policy</a> for details.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Service &quot;As Is&quot;</h2>
        <p>Orryon is provided &quot;AS IS&quot; without warranties of any kind. We cannot guarantee perfect accuracy, especially with AI-generated content.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, Orryon and its owners will not be liable for indirect, consequential, or punitive damages. Our total liability shall not exceed the amount you paid in the past 12 months.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Dispute Resolution</h2>
        <p>Any disputes arising from these Terms will be resolved through binding individual arbitration in the State of Wyoming, under the rules of the American Arbitration Association. You agree to waive class action lawsuits.</p>

        <div className="mt-12 p-6 bg-zinc-900 border border-white/10 rounded-2xl">
          <p className="text-sm text-white/70">
            By using Orryon, you acknowledge that you have read and agree to these Terms of Service, including the clear disclaimers about professional advice, AI limitations, 
            and the Breathe/Meditation feature.
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
