import streamlit as st

st.set_page_config(page_title="Terms of Use - orryon", page_icon="📜", layout="centered")

st.title("📜 Terms of Use & EULA")
st.markdown("**Last updated: April 11, 2026**")

st.markdown("""
### 1. Acceptance of Terms

By using Orryon, you agree to these Terms of Use.

### 2. Not Financial Advice

**ORRYON IS NOT A FINANCIAL ADVISOR.**

All budgets, forecasts, spending analysis, goal projections, and advice provided by orryon are for **informational and educational purposes only**.

- Do not make important financial decisions based solely on information from orryon.
- orryon is not a licensed financial advisor, accountant, tax professional, or lawyer.
- Past performance shown in the app is not indicative of future results.
- You use orryon **entirely at your own risk**.

### 3. "As Is" Software

Orryon is provided on an **"AS IS"** and **"AS AVAILABLE"** basis.

We make no warranties of any kind, including:
- Accuracy of forecasts or calculations
- Reliability of reminders or notifications
- Fitness for any particular purpose
- That the software will be error-free

### 4. Limitation of Liability

To the maximum extent permitted by law, the creators of orryon shall not be liable for any damages whatsoever (including, without limitation, lost profits, loss of data, or financial loss) arising out of or related to your use of orryon.

### 5. Local Data Responsibility

All your data is stored locally in the `finance.db` file on *your* device. 

**You are solely responsible for:**
- Backing up your data
- Keeping your device secure
- Protecting your xAI API key

We have no access to your data and cannot recover it if lost.

### 6. License

You are granted a limited, non-exclusive, non-transferable, revocable license to use orryon for personal, non-commercial use.

You may not:
- Sell, sublicense, or distribute orryon
- Reverse engineer the application (except as permitted by law)
- Remove or modify any disclaimers or legal notices

### 7. Changes to These Terms

We may update these Terms from time to time. Continued use of orryon after changes constitutes acceptance of the new terms.

---

**By using orryon, you acknowledge that you have read, understood, and agree to these terms.**
""")

st.warning("⚠️ This is not financial advice. Always consult qualified professionals for financial decisions.")

st.caption("All data remains on your local device. orryon has no cloud component by default.")
