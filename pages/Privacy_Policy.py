import streamlit as st

st.set_page_config(page_title="Privacy Policy - orryon", page_icon="🔒", layout="centered")

st.title("🔒 Privacy Policy")
st.markdown("**Effective Date: May 12, 2026 | Version 2.0**")

st.info("Orryon respects your privacy. This policy explains how we collect, use, disclose, and protect your information. By using the Service, you consent to these practices.")

st.markdown("""
## 1. Information We Collect

We collect information necessary to provide and improve the Service:

- **Account Information**: Email address for authentication (passwordless OTP), notifications, and recovery.
- **User Data**: Transactions, budgets, goals, accounts, notes, events, schedules, and other records you create.
- **AI Interaction Data**: Chat messages, history, and limited context summaries sent to third-party AI providers.
- **Billing Information**: Stripe customer and subscription IDs (we never store card details).
- **Technical & Usage Data**: Device info, IP, browser, access times, and error logs for security and improvement.
- **Optional Information**: Data you voluntarily provide (support requests, feedback).

## 2. How We Use Your Information

We use your information to provide and improve the Service, authenticate users, process payments, deliver AI features, send transactional emails, analyze usage, comply with law, and enforce our Terms.

## 3. Legal Bases for Processing

Where applicable (EEA, UK, California), legal bases include contract performance, consent, legitimate interests (security, improvement), and legal compliance. You may withdraw consent where applicable.

## 4. AI and Third-Party Processing

AI messages and limited context may be sent to xAI (Grok API). We do not send full databases. See xAI's policy: https://x.ai/legal/privacy-policy. Stripe handles billing (https://stripe.com/privacy). Optional SMTP providers handle emails you configure.

## 5. Sharing and Disclosure

We do not sell personal information. We may share with subprocessors under confidentiality, for legal compliance, to protect rights, or with your consent. Aggregated/de-identified data may be used for analytics.

## 6. International Data Transfers

Data may be processed in the US or other countries. We use Standard Contractual Clauses or other lawful mechanisms where required.

## 7. Data Retention

Data is kept as long as needed to provide the Service, meet legal obligations, resolve disputes, and enforce agreements. Upon deletion, personal data is removed from active systems within 30 days (subject to legal holds/backups up to ~90 days). Anonymized data may be retained indefinitely.

## 8. Your Rights and Choices

You may have rights to access, correct, delete, port, restrict, or object to processing. Use in-app Export/Delete tools or contact contact@orryon.com. We respond within legal timeframes (typically 30 days). Deletion is permanent.

## 9. Data Security

We use reasonable safeguards: OTP + JWT auth, optional ENCRYPTION_KEY (Fernet), HTTPS/TLS, and restricted access. No system is perfect; you are responsible for your credentials. We notify users of material breaches as required by law.

## 10. Children's Privacy

The Service is not directed to children under 13 (or applicable digital consent age). We do not knowingly collect personal information from children under 13. Contact us if you believe this has occurred.

## 11. Cookies and Tracking

We use essential cookies for authentication and functionality. No targeted advertising or cross-site tracking cookies. Browser settings control cookies (may affect functionality if disabled).

## 12. Changes to This Policy

Material changes will be announced via Effective Date update, in-app notice, or email. Continued use after the Effective Date constitutes acceptance.

## 13. Contact

Questions? Email contact@orryon.com (include "Privacy Request" for formal notices).

---

**By using Orryon, you acknowledge that you have read and agree to this Privacy Policy and our Terms of Service.**

This is not legal advice. Contact contact@orryon.com with questions.
""")

st.caption("© 2026 Orryon. All rights reserved.")