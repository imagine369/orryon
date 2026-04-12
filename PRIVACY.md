# Privacy Policy

**Last updated: April 12, 2026**

Orryon ("we", "us", or "our") is a privacy-focused personal finance and productivity tool.

### How Orryon Works

Orryon is a web application. Your financial data is stored in an encrypted SQLite database on our servers, accessible only through your authenticated account. We do not sell, share, or monetize your data.

### Data We Collect

- **Email address**: Used for authentication (passwordless OTP sign-in) and optional notification emails (digests, reminders).
- **Financial data you enter**: Transactions, budgets, goals, notes, and other information you provide through chat or manual entry.
- **Chat messages**: Your conversations with the AI assistant are stored to provide conversation history and context.

### Data We Do NOT Collect

- We do not track you across websites or devices.
- We do not use analytics or tracking cookies.
- We do not sell or share your personal data with third parties for marketing.

### Third-Party Services

- **xAI Grok API**: When you use the AI chat, your message and a summary of your current financial context are sent to xAI for processing. Please review xAI's [privacy policy](https://x.ai/legal/privacy-policy). No raw database exports or full history are shared — only the context needed to answer your current request.
- **Stripe**: If you subscribe to Pro, your payment information is handled entirely by Stripe. We never see or store your credit card number. See Stripe's [privacy policy](https://stripe.com/privacy).
- **Email (SMTP)**: OTP codes, daily digests, and event reminders are sent via email if configured. No marketing emails, ever.

### Data Security

- Authentication uses JWT tokens with secure secrets.
- OTP verification codes are SHA-256 hashed before storage.
- Database access requires a valid authenticated session.
- All connections in production use HTTPS/TLS.

### Your Rights

- **Export**: You can export all your data at any time from Settings (ZIP download).
- **Delete**: You can permanently delete your account and all associated data from Settings.
- **Portability**: Your exported data includes a JSON file and SQLite database with all your records.

### Data Retention

- Your data is retained as long as your account is active.
- When you delete your account, all associated data is permanently removed from our servers.

### Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of material changes by updating the date at the top of this page.

---

**Questions?** Contact us at privacy@orryon.app
