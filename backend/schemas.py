"""
backend/schemas.py — Pydantic request/response models for the orryon API.

All models used by route handlers are defined here to keep routers focused
on business logic. Grouped by domain.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────────────────────────────

class SendCodeReq(BaseModel):
    email: str
    # Set by the Orryon web app for the public "free breathing" signup only.
    # Skips invite-only waitlist gating; OTP + rate limits still apply.
    free_breathing_signup: bool = False

class VerifyReq(BaseModel):
    email: str
    code: str
    display_name: Optional[str] = None
    free_breathing_signup: bool = False

class SignupCheckoutReq(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str

class NoCardTierReq(BaseModel):
    tier: str

class AuthRes(BaseModel):
    token: str
    user: dict


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatReq(BaseModel):
    message: str
    session_id: str = ""


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionReq(BaseModel):
    amount: float
    merchant: str
    category: str
    date: Optional[str] = None
    notes: Optional[str] = ""


# ── Events ────────────────────────────────────────────────────────────────────

class EventReq(BaseModel):
    title: str
    date: str
    time: Optional[str] = ""
    description: Optional[str] = ""
    event_type: Optional[str] = "event"
    reminder_minutes: Optional[int] = 30


# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalReq(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[str] = ""
    category: Optional[str] = "other"
    notes: Optional[str] = ""

class GoalUpdate(BaseModel):
    current_amount: Optional[float] = None
    target_amount: Optional[float] = None
    name: Optional[str] = None
    notes: Optional[str] = None
    is_completed: Optional[int] = None


# ── Notes ─────────────────────────────────────────────────────────────────────

class NoteReq(BaseModel):
    title: str
    content: Optional[str] = ""
    tags: Optional[str] = ""
    mood: Optional[str] = ""
    linked_goal: Optional[str] = ""

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None
    mood: Optional[str] = None
    is_pinned: Optional[int] = None


# ── Tasks ─────────────────────────────────────────────────────────────────────

class TaskReq(BaseModel):
    title: str
    due_date: Optional[str] = ""
    priority: Optional[str] = "medium"
    category: Optional[str] = "personal"

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    sort_order: Optional[int] = None

class ReorderReq(BaseModel):
    ids: List[str]


# ── Grocery ───────────────────────────────────────────────────────────────────

class GroceryItemReq(BaseModel):
    name: str
    quantity: Optional[str] = "1"


# ── User Lists ────────────────────────────────────────────────────────────────

class UserListReq(BaseModel):
    name: str
    icon: Optional[str] = "📋"
    color: Optional[str] = "#ffffff"

class UserListUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

class ListItemReq(BaseModel):
    name: str
    notes: Optional[str] = ""

class ListItemUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    is_checked: Optional[int] = None
    sort_order: Optional[int] = None


# ── Budget ────────────────────────────────────────────────────────────────────

class BudgetReq(BaseModel):
    category: str
    planned: float
    month: Optional[str] = None


# ── Bills ─────────────────────────────────────────────────────────────────────

class BillReq(BaseModel):
    name: str
    amount: float
    frequency: Optional[str] = "monthly"
    next_due: Optional[str] = None
    category: Optional[str] = "Subscriptions"


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    display_name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    default_reminder_minutes: Optional[int] = None
    daily_digest_enabled: Optional[int] = None
    daily_digest_time: Optional[str] = None
    weekly_report_enabled: Optional[int] = None
    bill_due_alert_days: Optional[int] = None
    currency: Optional[str] = None
    budget_cycle_start: Optional[int] = None
    spending_alert_pct: Optional[int] = None

class EmailChangeSendReq(BaseModel):
    new_email: str

class EmailChangeVerifyReq(BaseModel):
    new_email: str
    code: str


# ── Subscription / Billing ────────────────────────────────────────────────────

class CheckoutReq(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str
    tier: str | None = None  # pro | premium | premium_plus — validated against price_id


# ── Connections / Import ──────────────────────────────────────────────────────

class CSVColumnMapping(BaseModel):
    """Override auto-detected column mapping for CSV import."""
    date_column: str
    amount_column: str
    description_column: Optional[str] = None

class CSVImportConfirmReq(BaseModel):
    """Commit previously-previewed CSV transactions to the database."""
    transaction_ids: List[str]


# ── Streaks / Habits ─────────────────────────────────────────────────────────

class StreakReq(BaseModel):
    name: str
    emoji: Optional[str] = ""
    target_days: Optional[int] = None
    id: Optional[str] = None

class StreakUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    target_days: Optional[int] = None

class StreakDayToggle(BaseModel):
    date_key: str

class ResetCompletionReq(BaseModel):
    anchor_id: str
    duration: int
    pre_mood: Optional[str] = None
    id: Optional[str] = None

class ResetCompletionUpdate(BaseModel):
    post_mood: Optional[str] = None
    note: Optional[str] = None
    marked_for_streak: Optional[int] = None

class UserPreferencesUpdate(BaseModel):
    last_reset_anchor: Optional[str] = None

class StreakImportItem(BaseModel):
    id: str
    name: str
    emoji: Optional[str] = ""
    target_days: Optional[int] = None
    created_at: str
    completions: List[str] = []

class ResetCompletionImportItem(BaseModel):
    id: str
    anchor_id: str
    date_key: str
    duration: int
    pre_mood: Optional[str] = None
    post_mood: Optional[str] = None
    note: Optional[str] = None
    marked_for_streak: bool = False

class HabitsImportReq(BaseModel):
    streaks: List[StreakImportItem] = []
    reset_completions: List[ResetCompletionImportItem] = []
    last_reset_anchor: Optional[str] = None
