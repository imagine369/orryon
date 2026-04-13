"""
core/csv_importer.py — CSV transaction import with auto-detection.

Supports common bank CSV formats (Chase, Amex, generic) by detecting
column headers. Returns parsed transactions for user confirmation.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Known header patterns for popular banks
_COLUMN_MAPS = {
    "chase": {
        "date": ["Transaction Date", "Posting Date"],
        "description": ["Description"],
        "amount": ["Amount"],
    },
    "amex": {
        "date": ["Date"],
        "description": ["Description"],
        "amount": ["Amount"],
    },
    "generic": {
        "date": ["date", "Date", "DATE", "transaction_date", "Transaction Date", "posting_date"],
        "description": ["description", "Description", "DESC", "merchant", "Merchant", "Name", "name", "Payee"],
        "amount": ["amount", "Amount", "AMOUNT", "Debit", "debit"],
    },
}

_DATE_FORMATS = [
    "%m/%d/%Y",
    "%Y-%m-%d",
    "%m-%d-%Y",
    "%d/%m/%Y",
    "%m/%d/%y",
    "%Y/%m/%d",
    "%B %d, %Y",
    "%b %d, %Y",
]


def parse_csv(
    file_bytes: bytes,
    user_id: str,
    column_override: dict | None = None,
) -> dict:
    """
    Parse a bank CSV file and return structured transaction data.

    Args:
        file_bytes: Raw CSV content.
        user_id: Owner of the imported transactions.
        column_override: Optional manual column mapping with keys
            ``date_column``, ``amount_column``, ``description_column``.
            When provided, auto-detection is skipped.

    Returns:
        {
            "status": "ok" | "needs_mapping" | "error",
            "transactions": [...],
            "detected_format": str,
            "column_mapping": dict,
            "headers": list,
            "error": str (if status == "error"),
        }
    """
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("latin-1")
        except Exception:
            return {"status": "error", "error": "Could not decode file. Please use UTF-8 CSV.", "transactions": []}

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if len(rows) < 2:
        return {"status": "error", "error": "CSV has no data rows.", "transactions": []}

    headers = [h.strip() for h in rows[0]]

    if column_override:
        col_map = {
            "date": [column_override["date_column"]],
            "description": [column_override.get("description_column", "")],
            "amount": [column_override["amount_column"]],
        }
        detected_format = "manual"
        for key in ("date", "amount"):
            if col_map[key][0] not in headers:
                return {
                    "status": "error",
                    "error": f"Column '{col_map[key][0]}' not found in CSV headers: {headers}",
                    "transactions": [],
                }
    else:
        detected_format, col_map = _detect_format(headers)

        if not col_map:
            return {
                "status": "needs_mapping",
                "headers": headers,
                "transactions": [],
                "detected_format": "unknown",
                "row_count": len(rows) - 1,
            }

    transactions = []
    seen_hashes = set()

    for row in rows[1:]:
        if len(row) < len(headers):
            continue

        row_dict = dict(zip(headers, row))
        date_str = _get_field(row_dict, col_map["date"])
        desc_str = _get_field(row_dict, col_map["description"])
        amount_str = _get_field(row_dict, col_map["amount"])

        if not date_str or not amount_str:
            continue

        parsed_date = _parse_date(date_str)
        if not parsed_date:
            continue

        try:
            amount = abs(float(amount_str.replace(",", "").replace("$", "")))
        except (ValueError, TypeError):
            continue

        if amount == 0:
            continue

        dedup_hash = hashlib.md5(f"{parsed_date}{amount}{desc_str}".encode()).hexdigest()[:12]
        if dedup_hash in seen_hashes:
            continue
        seen_hashes.add(dedup_hash)

        category = _guess_category(desc_str)

        transactions.append({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "date": parsed_date,
            "amount": amount,
            "merchant": desc_str[:100] if desc_str else "Unknown",
            "description": desc_str[:200] if desc_str else "",
            "category": category,
            "is_recurring": 0,
            "metadata": f'{{"import": true, "hash": "{dedup_hash}"}}',
        })

    return {
        "status": "ok",
        "transactions": transactions,
        "detected_format": detected_format,
        "column_mapping": col_map,
        "headers": headers,
        "count": len(transactions),
        "duplicates_removed": len(rows) - 1 - len(transactions),
    }


def _detect_format(headers: list[str]) -> tuple[str, dict | None]:
    """Try to match headers against known bank formats."""
    headers_lower = [h.lower().strip() for h in headers]

    for fmt_name, fmt_map in _COLUMN_MAPS.items():
        date_col = _find_matching_col(headers, fmt_map["date"])
        desc_col = _find_matching_col(headers, fmt_map["description"])
        amount_col = _find_matching_col(headers, fmt_map["amount"])

        if date_col and amount_col:
            return fmt_name, {
                "date": [date_col],
                "description": [desc_col] if desc_col else [""],
                "amount": [amount_col],
            }

    return "unknown", None


def _find_matching_col(headers: list[str], candidates: list[str]) -> str | None:
    headers_lower = {h.lower().strip(): h for h in headers}
    for c in candidates:
        if c.lower() in headers_lower:
            return headers_lower[c.lower()]
    return None


def _get_field(row_dict: dict, col_names: list[str]) -> str:
    for col in col_names:
        if col in row_dict and row_dict[col].strip():
            return row_dict[col].strip()
    return ""


def _parse_date(date_str: str) -> str | None:
    """Try multiple date formats and return YYYY-MM-DD."""
    date_str = date_str.strip()
    for fmt in _DATE_FORMATS:
        try:
            d = datetime.strptime(date_str, fmt)
            return d.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _guess_category(description: str) -> str:
    """Simple keyword-based category guesser."""
    desc = (description or "").lower()
    mapping = {
        "Food & Dining": ["restaurant", "dining", "sushi", "coffee", "cafe", "starbucks",
                          "mcdonald", "chipotle", "pizza", "bar", "grill", "diner", "lunch", "dinner"],
        "Groceries": ["grocery", "whole foods", "trader joe", "safeway", "costco", "aldi",
                       "kroger", "walmart supercenter", "target grocery"],
        "Transport": ["uber", "lyft", "gas", "shell", "chevron", "parking", "metro", "transit", "bus"],
        "Subscriptions": ["netflix", "spotify", "hulu", "apple", "disney", "youtube premium",
                          "amazon prime", "subscription"],
        "Health & Fitness": ["gym", "doctor", "pharmacy", "cvs", "walgreens", "medical", "dental",
                             "health", "fitness"],
        "Shopping": ["amazon", "target", "walmart", "clothes", "clothing", "nike", "zappos", "ebay"],
        "Rent & Housing": ["rent", "mortgage", "property"],
        "Utilities": ["electricity", "water", "internet", "phone", "utility", "at&t", "verizon",
                       "comcast", "pg&e"],
        "Entertainment": ["movie", "theater", "concert", "game", "steam", "playstation", "xbox"],
        "Travel": ["airline", "hotel", "airbnb", "flight", "booking", "expedia"],
    }
    for category, keywords in mapping.items():
        for kw in keywords:
            if kw in desc:
                return category
    return "Other"
