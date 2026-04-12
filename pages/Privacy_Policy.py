import streamlit as st

st.set_page_config(page_title="Privacy Policy - orryon", page_icon="🔒", layout="centered")

st.title("🔒 Privacy Policy")
st.markdown("**Last updated: April 11, 2026**")

st.markdown("""
### Orryon is built differently.

We believe your financial life, goals, schedule, and personal notes are **your private business**. That's why Orryon was designed from the ground up to be fully local-first.

### What We Mean By "Local-First"

- **All your data stays on your device.**  
  Your transactions, budgets, goals, calendar events, grocery list, notes, and chat history are stored **only** in a local SQLite database file called `finance.db`.

- **We do not run a server.**  
  There is no Orryon cloud service collecting or storing your personal data.

- **The only data that leaves your computer** is the text you choose to send to the Grok AI (xAI) when you use the chat feature. This is necessary for the AI to understand your requests and respond intelligently.

### What We Store Locally

- **Email address**: If you sign in with OTP, your email is stored in the local `finance.db` to identify your account across sessions. It never leaves your device.
- **Financial & personal data**: All transactions, budgets, goals, events, notes, and chat history are stored only in `finance.db` on your device.

We do not transmit, collect, or store any of this data on any server.

### What We Do Not Do

- We do not track you.
- We do not sell, rent, or share any user data with third parties.
- We do not use analytics or tracking pixels.
- We do not have access to your data.

### Third-Party Services

- **xAI Grok API**: When you chat with orryon, your message is sent to xAI’s API. xAI’s privacy practices govern that data. Please see their [Privacy Policy](https://x.ai/legal/privacy-policy).
- **Email Notifications** (optional): If you set up SMTP for reminders and digests, emails are sent from *your own email account*. We never see the content.

### Shared Dashboard Links

You can generate a read-only share link to your Dashboard. Anyone with that link can view your financial overview. This data is still coming from your local database — we do not host it.

### Your Responsibilities

- Back up your `finance.db` file regularly.
- Keep your xAI API key private.
- Understand that shared links expose your data to whoever you send them to.

### Changes to This Policy

We may update this Privacy Policy occasionally. Material changes will be noted here.

---

**Orryon was created with one core principle: Your data belongs to you, not to us.**

If you have any questions, feel free to ask orryon directly in the app.
""")

st.caption("Your email and data are stored locally in finance.db only. No cloud storage. No tracking.")
