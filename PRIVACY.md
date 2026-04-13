# Privacy Policy

**Last updated: April 12, 2026**

Orryon is a personal finance, productivity, and AI concierge tool that requires a paid subscription after the 14-day free trial.

This Privacy Policy explains how we handle your data. It should be read together with our [Terms of Service](TERMS.md).

### How Orryon Works
After the 14-day trial, continued use of Orryon requires an active paid subscription. Your data is stored in a SQLite database on our servers. We also support self-hosting, though a subscription is still required for full access.

We do not sell, share, or monetize your personal data.

### Data We Collect
- Account information (email for authentication and notifications)
- Financial and productivity data you create (transactions, budgets, goals, notes, events, etc.)
- Chat messages and conversation history (to maintain AI context)
- Stripe subscription metadata (we never store card details)

### Third-Party Services
- **xAI Grok API**: Your messages and limited context are sent for AI processing. We do not send full database exports.
- **Stripe**: Handles all billing and payments.
- **SMTP (Optional)**: Used for transactional emails when configured.

### Data Security
- Secure authentication via OTP and JWT
- Optional at-rest encryption using `ENCRYPTION_KEY`
- All production traffic uses HTTPS
- Database access is restricted to authenticated users

### Your Rights
- **Data Export**: You can download a ZIP containing your full data at any time.
- **Account Deletion**: You can permanently delete your account and all data. This is also the required method to cancel your subscription.
- Data is deleted from our servers within 30 days of account deletion.

### Changes to This Policy
We may update this Privacy Policy. Material changes will be reflected by updating the date at the top.

---

**By using Orryon, you acknowledge that you have read and agree to both this Privacy Policy and the Terms of Service.**

**Questions?** Contact us at privacy@orryon.app

**© 2026 Orryon.**