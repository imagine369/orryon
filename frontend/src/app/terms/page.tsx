import { Footer } from "@/components/footer";
import { BackButton } from "@/components/back-button";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
    <div className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
      <BackButton />
      <h1 className="text-3xl font-bold mt-4 mb-6">Terms of Service</h1>
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-white/40 text-xs mb-6">Effective Date: May 12, 2026 | Version 2.0</p>
        
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 mb-8">
          <p className="text-sm text-white/80">
            <strong>IMPORTANT NOTICE:</strong> PLEASE READ THESE TERMS OF SERVICE CAREFULLY. BY ACCESSING, USING, OR REGISTERING FOR ORRYON (THE "SERVICE"), YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE LEGALLY BOUND BY THESE TERMS, INCLUDING THE DISCLAIMERS, LIMITATIONS OF LIABILITY, ARBITRATION AGREEMENT, AND CLASS ACTION WAIVER BELOW. IF YOU DO NOT AGREE, DO NOT USE THE SERVICE.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Definitions</h2>
        <p>"Orryon," "we," "us," or "our" means Orryon, its affiliates, officers, directors, employees, agents, and licensors. "You" or "your" means the individual or entity accessing or using the Service. "Content" means all text, data, information, software, graphics, audio, video, or other materials provided by or through the Service, including AI-generated outputs. "User Content" means any data, information, or materials you submit, upload, or transmit to the Service.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. Acceptance of Terms &amp; Eligibility</h2>
        <p>By using the Service, you represent and warrant that: (a) you are at least 18 years of age and have the legal capacity to enter into these Terms; (b) you are not located in a country embargoed by the United States or on any U.S. prohibited or restricted party list; and (c) you will comply with all applicable laws and regulations. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Description of Service</h2>
        <p>Orryon is a personal finance, productivity, AI concierge, and wellness platform. Features may include transaction tracking, budgeting tools, goal setting, AI chat assistance powered by third-party models (including xAI Grok), breathing and meditation exercises, scheduling, and related services. We reserve the right to modify, suspend, or discontinue any feature at any time without notice or liability.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. Not Professional Advice; Assumption of Risk</h2>
        <p><strong>ORRYON IS NOT A FINANCIAL ADVISOR, LAWYER, ACCOUNTANT, TAX ADVISOR, DOCTOR, THERAPIST, OR ANY OTHER LICENSED PROFESSIONAL.</strong> All Content, forecasts, budgets, suggestions, projections, AI responses, wellness recommendations, breathing exercises, meditation guidance, and any other output is provided for informational, organizational, educational, and general wellness purposes only and does not constitute professional advice of any kind.</p>
        <p>YOU ACKNOWLEDGE AND AGREE THAT: (I) YOU USE THE SERVICE ENTIRELY AT YOUR OWN RISK; (II) YOU SHOULD NOT MAKE ANY FINANCIAL, LEGAL, MEDICAL, MENTAL HEALTH, OR OTHER IMPORTANT DECISIONS BASED SOLELY ON THE SERVICE OR ITS OUTPUTS; (III) THE BREATHE AND MEDITATION FEATURES ARE NOT MEDICAL TREATMENT, THERAPY, OR A SUBSTITUTE FOR PROFESSIONAL HEALTHCARE; (IV) IF YOU HAVE ANY MEDICAL OR MENTAL HEALTH CONDITION, YOU WILL CONSULT A QUALIFIED HEALTHCARE PROFESSIONAL BEFORE USE; AND (V) ORRYON HAS NO LIABILITY FOR ANY DECISION, ACTION, OR INACTION YOU TAKE BASED ON THE SERVICE.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. AI Limitations; No Reliance</h2>
        <p>The AI assistant uses third-party large language models (including xAI Grok) and may produce inaccurate, incomplete, biased, hallucinated, outdated, or otherwise unreliable outputs. AI responses do not reflect our views and are not verified by us. YOU AGREE NOT TO RELY ON ANY AI OUTPUT FOR ANY PURPOSE, ESPECIALLY ANY DECISION WITH MATERIAL FINANCIAL, LEGAL, HEALTH, OR SAFETY CONSEQUENCES. We reserve the right to modify, limit, suspend, or remove AI features at any time without notice.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Subscription, Billing &amp; Cancellation</h2>
        <p>New users on monthly plans receive a 14-day free trial of paid features (annual plans are charged immediately upon signup). After the trial, continued access requires a paid subscription. Subscriptions automatically renew at the then-current rate unless cancelled. All payments are processed by Stripe; we do not store payment card details.</p>
        <p>Current pricing is displayed at signup and in Settings (subject to change). To cancel, use the Stripe billing portal via Settings → Manage Billing. Cancellation takes effect at the end of the current billing period. YOU WILL NOT RECEIVE ANY REFUND OR CREDIT FOR PARTIAL PERIODS, UNUSED TIME, OR ANNUAL SUBSCRIPTIONS. Annual subscriptions are non-refundable. We may offer refunds in our sole discretion; any such offer does not create a right to future refunds. If you cancel, your data remains accessible until deletion.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Intellectual Property</h2>
        <p>The Service and all Content (excluding User Content) are owned by Orryon or its licensors and are protected by copyright, trademark, patent, trade secret, and other intellectual property laws. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your personal, non-commercial use. You may not copy, modify, distribute, sell, rent, lease, sublicense, reverse engineer, decompile, or create derivative works from the Service or Content without our prior written consent.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Acceptable Use Policy</h2>
        <p>You agree not to, and not to permit any third party to: (a) use the Service for any illegal, harmful, fraudulent, or unauthorized purpose; (b) scrape, crawl, spider, or otherwise harvest data or Content; (c) reverse engineer, decompile, disassemble, or attempt to derive source code; (d) upload, transmit, or store any virus, malware, or harmful code; (e) interfere with or disrupt the Service or servers; (f) attempt to gain unauthorized access; (g) use the AI to generate content that is illegal, abusive, hateful, defamatory, or violates third-party rights; (h) resell, sublicense, or provide the Service to third parties; (i) use the Service to train or improve any AI model without written permission; or (j) violate any applicable law or third-party right.</p>
        <p>We may suspend or terminate your account for any violation, in our sole discretion, without notice or refund.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. User Content &amp; License</h2>
        <p>You retain ownership of your User Content. You grant Orryon a worldwide, royalty-free, perpetual, irrevocable, sublicensable license to use, host, store, reproduce, modify, create derivative works from, and display your User Content solely as necessary to provide and improve the Service. You represent that you have all rights necessary to grant this license and that your User Content does not violate any law or third-party right.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">10. Privacy</h2>
        <p>Your use of the Service is subject to our <a href="/privacy" className="underline">Privacy Policy</a>, which is incorporated by reference. By using the Service, you consent to our collection, use, and disclosure of your information as described therein.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">11. Third-Party Services</h2>
        <p>The Service integrates with or links to third-party services (including xAI Grok, Stripe, and optional SMTP providers). We are not responsible for any third-party service, its content, or its practices. Your use of third-party services is at your own risk and subject to their terms.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">12. Disclaimers; No Warranties</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE AND ALL CONTENT ARE PROVIDED "AS IS," "AS AVAILABLE," AND WITHOUT ANY WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, OR THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR MEET YOUR REQUIREMENTS. WE DO NOT WARRANT THAT AI OUTPUTS WILL BE ACCURATE, COMPLETE, OR SUITABLE FOR ANY PURPOSE. YOU ASSUME ALL RISK OF USING THE SERVICE.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">13. Limitation of Liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ORRYON AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, EXEMPLARY, OR OTHER DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, USE, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF (OR INABILITY TO USE) THE SERVICE, ANY CONTENT, AI OUTPUTS, OR THESE TERMS, REGARDLESS OF THE CAUSE OR THEORY OF LIABILITY AND WHETHER OR NOT WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
        <p>OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS SHALL NOT EXCEED THE TOTAL AMOUNT YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. THE FOREGOING LIMITATIONS SHALL APPLY EVEN IF ANY REMEDY FAILS OF ITS ESSENTIAL PURPOSE. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES; IN SUCH CASES, OUR LIABILITY SHALL BE LIMITED TO THE MAXIMUM EXTENT PERMITTED BY LAW.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">14. Indemnification</h2>
        <p>You agree to indemnify, defend, and hold harmless Orryon and its affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Service; (b) your User Content; (c) your violation of these Terms; (d) your violation of any law or third-party right; or (e) any dispute between you and a third party. We reserve the right to assume the exclusive defense and control of any matter subject to indemnification, and you agree to cooperate with us.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">15. Dispute Resolution; Arbitration; Class Action Waiver</h2>
        <p>PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.</p>
        <p>Any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved exclusively through binding individual arbitration administered by the American Arbitration Association ("AAA") under its Commercial Arbitration Rules, in the State of Wyoming, United States. The arbitration shall be conducted by a single arbitrator. Judgment on the award may be entered in any court having jurisdiction.</p>
        <p>YOU AGREE THAT ANY ARBITRATION OR PROCEEDING WILL BE LIMITED TO THE DISPUTE BETWEEN YOU AND ORRYON, AND YOU WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION, CLASS ARBITRATION, OR OTHER REPRESENTATIVE PROCEEDING. THE ARBITRATOR MAY NOT CONSOLIDATE CLAIMS OR PRESIDE OVER ANY FORM OF REPRESENTATIVE PROCEEDING.</p>
        <p>You may opt out of this arbitration agreement by emailing support@orryon.com within thirty (30) days of first using the Service, stating your intent to opt out. If you do not opt out, this arbitration agreement shall be binding.</p>
        <p>Nothing in this section prevents either party from seeking injunctive or other equitable relief in a court of competent jurisdiction for intellectual property or breach of confidentiality claims. This arbitration agreement shall survive termination of these Terms.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">16. Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with the laws of the State of Wyoming, without regard to its conflict of laws principles. The United Nations Convention on Contracts for the International Sale of Goods does not apply.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">17. Changes to Terms</h2>
        <p>We may modify these Terms at any time. If we make material changes, we will provide notice by updating the Effective Date, posting a notice in the Service, or sending an email. Your continued use of the Service after the Effective Date of any changes constitutes your acceptance of the modified Terms. If you do not agree, you must stop using the Service.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">18. Miscellaneous</h2>
        <p>These Terms, together with the Privacy Policy, constitute the entire agreement between you and Orryon concerning the Service and supersede all prior agreements. If any provision is held invalid or unenforceable, the remaining provisions shall continue in full force. Our failure to enforce any right shall not constitute a waiver. You may not assign these Terms without our prior written consent; we may assign freely. These Terms do not create any agency, partnership, or joint venture. Sections 4–18 shall survive termination.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">19. Contact</h2>
        <p>Questions? Contact us at <a href="mailto:support@orryon.com" className="underline">support@orryon.com</a>. For legal notices, send to the address provided upon request.</p>

        <div className="mt-12 p-6 bg-zinc-900 border border-white/10 rounded-2xl">
          <p className="text-sm text-white/70">
            BY USING ORRYON, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO THESE TERMS OF SERVICE, INCLUDING THE DISCLAIMERS THAT THIS IS NOT PROFESSIONAL ADVICE, THE LIMITATION OF LIABILITY, THE INDEMNIFICATION OBLIGATION, AND THE BINDING ARBITRATION AND CLASS ACTION WAIVER.
          </p>
          <p className="text-xs text-white/40 mt-4">
            This document is not legal advice. Questions or concerns? Contact us at <a href="mailto:support@orryon.com" className="underline hover:text-white">support@orryon.com</a>.
          </p>
        </div>
      </div>
    </div>
    <Footer />
    </div>
  );
}
