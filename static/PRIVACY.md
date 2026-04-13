# Privacy Policy

**Last updated: April 12, 2026**

Orryon ("we", "us", or "our") is a privacy-focused personal finance and productivity SaaS tool.

### How Orryon Works

Orryon is a hosted web application. Your financial data is stored in a SQLite database on our servers (self-hosting also supported). The database uses optional at-rest encryption (via ENCRYPTION_KEY). Access is restricted to your authenticated account. We do not sell, share, or monetize your personal data.

### Data We Collect

- **Account information**: Email address for authentication (passwordless OTP sign-in) and optional notification emails.
- **Financial and productivity data**: Transactions, budgets, goals, accounts, notes, events, subscriptions, and other records you create.
- **Usage data**: Chat messages and conversation history (stored to maintain context across sessions).
- **Billing data**: Stripe customer and subscription IDs (we never store card details).

### Data We Do NOT Collect

- We do not use analytics, tracking pixels, or cookies for marketing/tracking.
- We do not sell your data or share it with third parties for advertising.
- We do not collect unnecessary personal information beyond what is required for the service.

### Third-Party Services

- **xAI Grok API**: Your chat messages and a limited summary of relevant financial context are sent to xAI's Grok API for AI processing. We do not send raw database exports or full history. Review xAI's [privacy policy](https://x.ai/legal/privacy-policy).
- **Stripe**: All subscription billing and payment processing is handled by Stripe. We never see or store your credit card details. See Stripe's [privacy policy](https://stripe.com/privacy).
- **Email (SMTP)**: Transactional emails (OTP codes, optional digests/reminders) are sent using your configured SMTP provider. No marketing emails are ever sent.

### Data Security

- Authentication is handled via secure JWT tokens (with strong secrets in production).
- OTP codes are hashed (SHA-256) before storage.
- All database queries require a valid authenticated user session.
- Optional at-rest encryption of sensitive fields is available via `ENCRYPTION_KEY` (Fernet).
- All production traffic uses HTTPS/TLS. Self-hosted deployments are your responsibility to secure.

### Your Rights

- **Data Export**: Download a ZIP containing JSON and your full SQLite database from Settings > Export.
- **Account Deletion**: Permanently delete your account and all data from Settings > Delete Account.
- **Access and Portability**: You control your data; export gives you full portability.

### Data Retention

- Data is retained only while your account is active (or during the trial period).
- Upon account deletion, all associated data is permanently deleted from our servers within 30 days.
- Self-hosted users control their own data retention.

### Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of material changes by updating the date at the top of this page.

---

**Questions?** Contact us at support@orryon.app
