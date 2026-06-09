"""Contact form email template."""

from __future__ import annotations

import html as _html
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import SMTP_FROM, SMTP_USER
from core.email.branding import orryon_email_header_html


def build_contact_email(
    *,
    recipient: str,
    name: str,
    sender_email: str,
    subject: str,
    message: str,
) -> MIMEMultipart:
    """Build the contact-form notification email to the site owner."""
    from_addr = SMTP_FROM or SMTP_USER
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[orryon contact] {subject}"
    msg["From"] = from_addr
    msg["To"] = recipient
    msg["Reply-To"] = sender_email

    safe_name = _html.escape(name, quote=True)
    safe_email = _html.escape(sender_email, quote=True)
    safe_subject = _html.escape(subject, quote=True)
    safe_message = _html.escape(message, quote=True)
    mailto_subject = _html.escape(f"Re: {subject}", quote=True)

    plain = (
        f"New contact form submission from orryon.com\n\n"
        f"Name:    {name}\n"
        f"Email:   {sender_email}\n"
        f"Subject: {subject}\n\n"
        f"Message:\n{message}\n\n"
        f"— Reply directly to this email to respond to {name}."
    )

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#000;color:#fff;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#111;border-radius:16px;padding:40px;">
          {orryon_email_header_html()}
          <tr>
            <td align="center" style="padding-bottom:18px;">
              <p style="margin:0;font-size:12px;color:#555;letter-spacing:0.5px;">
                New message from orryon.com
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #1e293b;border-radius:10px;overflow:hidden;">
                <tr style="background:#0f172a;">
                  <td style="padding:12px 16px;border-bottom:1px solid #1e293b;">
                    <span style="font-size:10px;color:#475569;text-transform:uppercase;
                                 letter-spacing:1px;display:block;margin-bottom:4px;">From</span>
                    <span style="font-size:14px;color:#f1f5f9;font-weight:600;">{safe_name}</span>
                    <span style="font-size:13px;color:#64748b;"> &lt;{safe_email}&gt;</span>
                  </td>
                </tr>
                <tr style="background:#0f172a;">
                  <td style="padding:12px 16px;">
                    <span style="font-size:10px;color:#475569;text-transform:uppercase;
                                 letter-spacing:1px;display:block;margin-bottom:4px;">Subject</span>
                    <span style="font-size:14px;color:#f1f5f9;">{safe_subject}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;background:#0f172a;border:1px solid #1e293b;
                        border-radius:12px;">
              <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.75;
                         white-space:pre-wrap;">{safe_message}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <a href="mailto:{safe_email}?subject={mailto_subject}"
                 style="display:inline-block;padding:11px 28px;background:#fff;color:#000;
                         font-weight:600;font-size:13px;border-radius:8px;
                         text-decoration:none;letter-spacing:0.2px;">
                Reply to {safe_name}
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;">
              <p style="margin:0;font-size:11px;color:#333;">
                Submitted via the contact form at orryon.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg
