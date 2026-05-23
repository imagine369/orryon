"""
backend/routers/stripe_webhook.py — Stripe webhook handler (signature-validated, no JWT).

Extracted from account.py (Phase 2b).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from db import get_connection
from email_sender import _send_email, orryon_email_header_html

logger = logging.getLogger(__name__)

router = APIRouter(tags=["billing"])

def _notify_admin_new_subscriber(email: str, plan: str, billing_interval: str) -> None:
    """Fire-and-forget email to admin when a paid subscription checkout completes."""
    import html as _html
    from config import CONTACT_EMAIL, SMTP_FROM, SMTP_USER
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    admin = (CONTACT_EMAIL or "").strip()
    if not admin:
        return

    plan_labels = {
        "pro":          ("Pro",          "$22/mo or $198/yr"),
        "premium":      ("Premium",      "$33/mo or $297/yr"),
        "premium_plus": ("Premium Plus", "$44/mo or $396/yr"),
    }
    plan_name, plan_price = plan_labels.get(plan, (plan.title(), ""))
    interval_label = billing_interval.capitalize() if billing_interval else "Subscription"

    safe_email = _html.escape(email, quote=True)

    plain = (
        f"💳 New Paying Customer\n\n"
        f"Email:    {email}\n"
        f"Plan:     {plan_name} ({interval_label})\n"
        f"Price:    {plan_price}\n\n"
        "— orryon"
    )
    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             background:#000;color:#fff;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="420" cellpadding="0" cellspacing="0"
               style="background:#111;border-radius:16px;padding:40px;">
          {orryon_email_header_html()}
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:14px;font-weight:600;letter-spacing:1px;
                        text-transform:uppercase;color:#92fe9d;">💳 New Paying Customer</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 0 8px;">
              <span style="font-size:20px;font-weight:700;color:#fff;">{safe_email}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="background:#0f2027;border:1px solid rgba(146,254,157,0.25);
                          border-radius:12px;padding:16px 24px;display:inline-block;margin-top:8px;">
                <span style="font-size:22px;font-weight:800;color:#92fe9d;">{plan_name}</span>
                <span style="display:block;font-size:13px;color:#64748b;margin-top:4px;">
                  {interval_label} · {plan_price}
                </span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"💳 New subscriber — {email} ({plan_name})"
    msg["From"]    = SMTP_FROM or SMTP_USER or admin
    msg["To"]      = admin
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        ok, _ = _send_email(admin, msg)
        if ok:
            logger.info("Admin notified of new subscriber: %s plan=%s", email, plan)
        else:
            logger.warning("Failed to notify admin of new subscriber: %s", email)
    except Exception as exc:
        logger.warning("Admin subscriber notification error for %s: %s", email, exc)


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook handler — no auth required (validated via Stripe signature)."""
    from config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
    try:
        import stripe as stripe_lib
        stripe_lib.api_key = STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_lib.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe_lib.errors.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")

    event_id = event.get("id", "")
    if event_id:
        from backend.cache import check_rate_limit_async
        already_processed = not await check_rate_limit_async(
            f"stripe_event:{event_id}", limit=1, window_seconds=86400
        )
        if already_processed:
            logger.info("Skipping duplicate Stripe event %s", event_id)
            return {"received": True}

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        meta = session.get("metadata", {})
        user_id = meta.get("user_id")
        topup_type = meta.get("topup_type")

        if topup_type == "voice_topup" and user_id:
            # One-time voice minute top-up
            from db import add_voice_topup
            from backend.deps import VOICE_TOPUP_PRICE_USD
            minutes = int(meta.get("minutes", 60))
            pi_id = session.get("payment_intent", "")
            add_voice_topup(user_id, minutes, VOICE_TOPUP_PRICE_USD, pi_id or "")
            logger.info("Voice topup: +%d min for user=%s (pi=%s)", minutes, user_id, pi_id)

        else:
            # Regular subscription checkout — look up which tier was purchased
            sub_id = session.get("subscription")
            if isinstance(sub_id, dict):
                sub_id = sub_id.get("id")
            if user_id and sub_id:
                from config import PRICE_ID_TO_PLAN
                price_id = (meta.get("price_id") or "").strip()
                new_plan = PRICE_ID_TO_PLAN.get(price_id)

                # If metadata price_id isn't in our map (stale .env, wrong deploy),
                # read the live subscription from Stripe so Premium isn't stored as pro.
                if new_plan is None:
                    try:
                        sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
                        items = sub_obj.get("items", {}).get("data", [])
                        if items:
                            p = items[0].get("price") or {}
                            resolved = (p.get("id") or "").strip()
                            if resolved:
                                price_id = resolved
                                new_plan = PRICE_ID_TO_PLAN.get(price_id)
                    except Exception as e:
                        logger.warning(
                            "checkout.session.completed: could not retrieve subscription %s: %s",
                            sub_id,
                            e,
                        )

                if new_plan is None:
                    new_plan = "pro"
                    logger.warning(
                        "checkout.session.completed: unknown price_id=%r user=%s sub=%s — defaulting to pro",
                        price_id,
                        user_id,
                        sub_id,
                    )

                _cfg = __import__("config")
                billing_interval = "annual" if price_id in (
                    _cfg.STRIPE_PRICE_PRO_ANNUAL,
                    _cfg.STRIPE_PRICE_PREMIUM_ANNUAL,
                    _cfg.STRIPE_PRICE_PREMIUM_PLUS_ANNUAL,
                ) else "monthly"
                bps, bpe = "", ""
                try:
                    from core.usage_period import stripe_subscription_period_bounds

                    sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
                    bps, bpe = stripe_subscription_period_bounds(sub_obj)
                except Exception as exc:
                    logger.warning("checkout.session.completed: period for %s: %s", sub_id, exc)
                user_email = ""
                with get_connection() as conn:
                    conn.execute(
                        "UPDATE users SET plan=?, stripe_subscription_id=?, trial_ends_at='', segment='', "
                        "billing_period_start=?, billing_period_end=? WHERE id=?",
                        (new_plan, sub_id, bps, bpe, user_id),
                    )
                    conn.commit()
                    row = conn.execute("SELECT email FROM users WHERE id=?", (user_id,)).fetchone()
                    user_email = row["email"] if row else ""
                logger.info("Subscription checkout: user=%s plan=%s sub=%s price_id=%s", user_id, new_plan, sub_id, price_id)
                if user_email:
                    import asyncio as _asyncio
                    _asyncio.create_task(
                        _asyncio.to_thread(_notify_admin_new_subscriber, user_email, new_plan, billing_interval)
                    )

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        if sub_id:
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET plan='free', stripe_subscription_id='' WHERE stripe_subscription_id=?",
                    (sub_id,),
                )
                conn.commit()

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        status = sub.get("status")
        if sub_id and status:
            if status in ("active", "trialing", "past_due"):
                # Resolve tier from the subscription's current price ID
                from config import PRICE_ID_TO_PLAN
                try:
                    items = sub.get("items", {}).get("data", [])
                    price_id = items[0]["price"]["id"] if items else ""
                except Exception:
                    price_id = ""
                new_plan = PRICE_ID_TO_PLAN.get(price_id, "pro")
            else:
                new_plan = "free"
            bps, bpe = "", ""
            try:
                from core.usage_period import stripe_subscription_period_bounds

                bps, bpe = stripe_subscription_period_bounds(sub)
            except Exception:
                pass
            with get_connection() as conn:
                if status in ("active", "trialing", "past_due") and bps:
                    conn.execute(
                        "UPDATE users SET plan=?, billing_period_start=?, billing_period_end=? "
                        "WHERE stripe_subscription_id=?",
                        (new_plan, bps, bpe, sub_id),
                    )
                else:
                    conn.execute(
                        "UPDATE users SET plan=? WHERE stripe_subscription_id=?",
                        (new_plan, sub_id),
                    )
                conn.commit()

    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer", "")
        attempt = invoice.get("attempt_count", 0)
        logger.warning("Payment failed for customer %s (attempt %d)", customer_id, attempt)
        # After the first retry grace period, mark the account as past_due so
        # require_active_plan blocks access. Stripe will fire
        # customer.subscription.deleted once it exhausts all retries — that
        # sets plan='free' as the final state.
        if attempt >= 2 and customer_id:
            with get_connection() as conn:
                conn.execute(
                    "UPDATE users SET plan='past_due' WHERE stripe_customer_id=? AND plan NOT IN ('free', 'past_due')",
                    (customer_id,),
                )
                conn.commit()
            logger.info("Marked user past_due for customer=%s after %d failed attempt(s)", customer_id, attempt)

    elif event["type"] == "invoice.payment_succeeded":
        # Renewal confirmed — restore access if the user was past_due.
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer", "")
        sub_id = invoice.get("subscription", "")
        billing_reason = invoice.get("billing_reason", "")
        # Only act on renewals, not the initial checkout invoice (already
        # handled by checkout.session.completed).
        if customer_id and sub_id and billing_reason == "subscription_cycle":
            from config import PRICE_ID_TO_PLAN
            try:
                lines = invoice.get("lines", {}).get("data", [])
                price_id = lines[0]["price"]["id"] if lines else ""
            except Exception:
                price_id = ""
            new_plan = PRICE_ID_TO_PLAN.get(price_id, "pro")
            bps, bpe = "", ""
            try:
                from core.usage_period import stripe_subscription_period_bounds

                sub_obj = stripe_lib.Subscription.retrieve(str(sub_id))
                bps, bpe = stripe_subscription_period_bounds(sub_obj)
            except Exception as exc:
                logger.warning("invoice.payment_succeeded: period for %s: %s", sub_id, exc)
            with get_connection() as conn:
                if bps:
                    conn.execute(
                        "UPDATE users SET plan=?, billing_period_start=?, billing_period_end=? "
                        "WHERE stripe_customer_id=? AND stripe_subscription_id=?",
                        (new_plan, bps, bpe, customer_id, sub_id),
                    )
                else:
                    conn.execute(
                        "UPDATE users SET plan=? WHERE stripe_customer_id=? AND stripe_subscription_id=?",
                        (new_plan, customer_id, sub_id),
                    )
                conn.commit()
            logger.info("Renewal confirmed: customer=%s sub=%s plan=%s", customer_id, sub_id, new_plan)

    return {"received": True}
