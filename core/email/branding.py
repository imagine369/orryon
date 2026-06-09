"""Shared orryon email branding."""

from __future__ import annotations

import os

ORRYON_AVATAR_URL = os.getenv("ORRYON_AVATAR_URL", "https://www.orryon.com/avatar.png")
ORRYON_SITE_URL = os.getenv("ORRYON_SITE_URL", "https://www.orryon.com")


def orryon_email_header_html() -> str:
    """Branded header row for HTML email templates."""
    return (
        '<tr>'
        '<td align="center" style="padding-bottom:28px;">'
        f'<img src="{ORRYON_AVATAR_URL}" alt="orryon" '
        'width="64" height="64" '
        'style="display:block;width:64px;height:64px;border-radius:50%;'
        'margin:0 auto 14px;background:#000;" />'
        '<div style="font-family:\'Playfair Display\',Georgia,'
        '\'Times New Roman\',serif;font-size:22px;font-weight:800;'
        'letter-spacing:6px;text-transform:uppercase;color:#ffffff;'
        'line-height:1;">ORRYON</div>'
        '</td>'
        '</tr>'
    )
