import streamlit as st

st.set_page_config(page_title="Terms of Service - orryon", page_icon="📜", layout="centered")

st.title("📜 Terms of Service")
st.markdown("**Last updated: April 12, 2026**")

st.info("Thank you for using Orryon. We built this tool to genuinely help you with your finances, schedule, goals, and wellbeing.")

st.markdown("""
### Important Disclaimers

**Orryon is not a financial advisor, lawyer, accountant, doctor, or therapist.**

This includes all AI features and the Breathe/Meditation exercises. Everything in the app is provided for informational, organizational, and general wellness purposes only.

- Do not make important financial, legal, medical, or mental health decisions based solely on Orryon.
- The Breathe and Meditation features are **not** medical treatment or therapy.
- If you have any medical condition, please consult a qualified healthcare professional before using these features.
- You use Orryon at your own risk.

### AI and Wellness Features
The AI assistant (powered by xAI Grok) may sometimes be inaccurate. The wellness features are meant to support relaxation and mindfulness but are not a substitute for professional care.

### Subscription & Billing (Hosted Version)
New users get a 14-day Pro trial. Continued Pro access requires a paid subscription. Self-hosted users do not need to subscribe. Payments are processed by Stripe.

### Your Data & Privacy
You own your data. We provide easy export and account deletion tools. Self-hosted users keep everything locally in `finance.db`. See the full [Privacy Policy](/privacy) for details.

### Service "As Is"
Orryon is provided "AS IS" without warranties. We cannot guarantee perfect accuracy.

### Limitation of Liability
To the fullest extent permitted by law, Orryon and its owners are not liable for indirect or consequential damages. Our total liability is limited to the amount you paid in the past 12 months (or $0 for free/self-hosted use).

### Dispute Resolution
Any disputes arising from these Terms will be resolved through binding individual arbitration in the State of Wyoming.

---

**By using Orryon, you acknowledge that you have read and agree to these Terms.**

We genuinely want Orryon to be a helpful tool for you. These terms exist to protect both users and the project while we focus on building something useful and privacy-first.

See `TERMS.md` for the full authoritative version.
""")

st.caption("This is not legal advice. Consider consulting with a qualified attorney if you have questions.")