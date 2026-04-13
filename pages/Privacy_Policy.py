import streamlit as st

st.set_page_config(page_title="Privacy Policy - orryon", page_icon="🔒", layout="centered")

st.title("🔒 Privacy Policy")
st.markdown("**Last updated: April 12, 2026**")

st.info("We built Orryon with a strong focus on privacy and giving you control over your data.")

st.markdown("""
### Our Philosophy
Orryon is designed **local-first**. When self-hosted or used in demo mode, all your data stays on your device in `finance.db`. We have no access to it.

In the hosted version, we only collect what is necessary to provide the service and do not sell or monetize your personal data.

### What We Collect

**Self-Hosted / Local:**
- Everything stays on your device. We cannot see your data.

**Hosted Version:**
- Email address for authentication
- The financial and personal data you choose to store
- Chat history (to maintain AI conversation context)
- Basic subscription information

We do **not** use tracking analytics or advertising networks.

### AI and Wellness Features
When you use the AI chat, limited context is sent to xAI's Grok. The Breathe and Meditation features are for general wellness and relaxation.

Please see the **Terms of Service** for important disclaimers about these features.

### Third-Party Services
- **xAI Grok**: Powers the AI (limited data sent)
- **Stripe**: Handles payments securely
- **SMTP (optional)**: Used only if you set up email notifications

### Your Rights
- Export all your data anytime (full SQLite database + JSON)
- Delete your account and all data permanently
- Self-hosted users have complete control

### Security
We use secure authentication, optional encryption, and HTTPS for the hosted service. Self-hosted users control their own security.

---

**Our Promise**

We genuinely want Orryon to be a helpful, private tool that puts you in control. Your data belongs to you.

This Privacy Policy works together with our **Terms of Service**. By using Orryon, you agree to both.

See `PRIVACY.md` for the full authoritative version.
""")

st.caption("This is not legal advice. Feel free to ask Orryon directly in the app if you have questions about privacy.")