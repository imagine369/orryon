"""
backend/routers/connections.py — External connections and transaction import.

Orryon takes a tiered approach to transaction import, progressing from
maximum privacy to maximum convenience:

    Tier 1 — Manual entry via AI chat ("sushi $45 dining")
             Full local control. No external data flows.

    Tier 2 — CSV import (this module)
             Upload bank statements. The file is parsed in-memory using
             core/csv_importer.py and never persisted to disk. Supports
             Chase, Amex, and generic CSV formats with auto-detection.

    Tier 3 — Email forwarding (planned)
             Forward transaction alert emails to a dedicated address.
             Requires SMTP config. Parsed in the background.

    Tier 4 — Plaid bank link (planned, stubs below)
             Real-time account sync via Plaid. Config keys are already
             in config.py (PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV).

Endpoints:
    GET  /api/connections              — list connected services
    POST /api/import/csv               — upload CSV, get parsed preview
    POST /api/import/csv/confirm       — commit previewed transactions
    POST /api/connections/plaid/link   — create Plaid Link token (stub)
    POST /api/connections/plaid/exchange — exchange public_token (stub)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.auth import get_current_user
from backend.cache import cache_get, cache_set
from backend.deps import require_active_plan
from backend.schemas import CSVColumnMapping, CSVImportConfirmReq
from config import PLAID_CLIENT_ID, PLAID_ENABLED, PLAID_SECRET
from db import adjust_balance, get_connection, insert_row

logger = logging.getLogger(__name__)

router = APIRouter(tags=["connections"], dependencies=[Depends(require_active_plan)])

# CSV previews are staged in Redis (when configured) so preview and confirm
# can land on different workers. Falls back to an in-process dict in dev.
_CSV_STAGING_TTL = 900  # 15 minutes


def _csv_staging_key(uid: str) -> str:
    return f"csv_staging:{uid}"


async def _stage_csv(uid: str, transactions: list[dict]) -> None:
    await cache_set(_csv_staging_key(uid), transactions, ttl_seconds=_CSV_STAGING_TTL)


async def _pop_csv_staging(uid: str) -> list[dict] | None:
    key = _csv_staging_key(uid)
    staged = await cache_get(key)
    if staged is None:
        return None
    # Best-effort invalidation — overwrite with an empty list that expires quickly.
    await cache_set(key, [], ttl_seconds=1)
    return staged


# ── Connection Inventory ──────────────────────────────────────────────────────

@router.get("/api/connections")
async def list_connections(user: dict = Depends(get_current_user)):
    """
    List the user's connected external services and available integrations.

    Returns which import tiers are available based on current config.
    """
    available = ["csv_import"]
    if PLAID_ENABLED:
        available.append("plaid")

    return {
        "connections": [],
        "available": available,
        "tiers": {
            "manual": {"status": "active", "description": "Add transactions via AI chat"},
            "csv": {"status": "active", "description": "Upload bank CSV files"},
            "email": {"status": "planned", "description": "Forward transaction alert emails"},
            "plaid": {
                "status": "active" if PLAID_ENABLED else "not_configured",
                "description": "Real-time bank account sync via Plaid",
            },
        },
    }


# ── CSV Import ────────────────────────────────────────────────────────────────

@router.post("/api/import/csv")
async def upload_csv(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload a bank CSV file and get a parsed preview of transactions.

    The file is processed in-memory using core/csv_importer.py — it is
    never written to disk. Auto-detects Chase, Amex, and generic column
    formats. Returns parsed transactions for user review before committing.

    After reviewing, call POST /api/import/csv/confirm with the IDs of
    transactions to keep.
    """
    uid = user["user_id"]

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a .csv file")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5 MB)")

    from core.csv_importer import parse_csv

    result = parse_csv(contents, uid)

    if result["status"] == "error":
        raise HTTPException(422, result.get("error", "Could not parse CSV"))

    if result["status"] == "needs_mapping":
        return {
            "status": "needs_mapping",
            "headers": result["headers"],
            "row_count": result.get("row_count", 0),
            "message": "Could not auto-detect column mapping. Please provide a mapping.",
        }

    await _stage_csv(uid, result["transactions"])
    logger.info("CSV preview: %d transactions staged for user %s", len(result["transactions"]), uid[:8])

    return {
        "status": "preview",
        "count": result["count"],
        "duplicates_removed": result.get("duplicates_removed", 0),
        "detected_format": result["detected_format"],
        "transactions": [
            {
                "id": t["id"],
                "date": t["date"],
                "amount": t["amount"],
                "merchant": t["merchant"],
                "category": t["category"],
            }
            for t in result["transactions"]
        ],
    }


@router.post("/api/import/csv/confirm")
async def confirm_csv_import(
    body: CSVImportConfirmReq,
    user: dict = Depends(get_current_user),
):
    """
    Commit previously-previewed CSV transactions to the database.

    Accepts a list of transaction IDs from the preview response. Only
    the selected transactions are inserted; the rest are discarded.
    """
    uid = user["user_id"]
    staged = await _pop_csv_staging(uid)

    if not staged:
        raise HTTPException(
            400,
            "No CSV preview found. Upload a CSV file first via POST /api/import/csv.",
        )

    selected_ids = set(body.transaction_ids)
    to_insert = [t for t in staged if t["id"] in selected_ids]

    if not to_insert:
        return {"imported": 0, "message": "No transactions selected."}

    imported = 0
    for txn in to_insert:
        try:
            insert_row("transactions", txn)
            adjust_balance(uid, -txn["amount"])
            imported += 1
        except Exception as exc:
            logger.warning("Failed to import transaction %s: %s", txn["id"][:8], exc)

    logger.info("CSV import: %d/%d transactions committed for user %s", imported, len(to_insert), uid[:8])

    return {
        "imported": imported,
        "total_selected": len(to_insert),
        "message": f"Imported {imported} transactions.",
    }


@router.post("/api/import/csv/mapped")
async def upload_csv_with_mapping(
    file: UploadFile = File(...),
    date_column: str = Form(...),
    amount_column: str = Form(...),
    description_column: str = Form(""),
    user: dict = Depends(get_current_user),
):
    """
    Re-upload a CSV with an explicit column mapping.

    Called after the initial upload returned status "needs_mapping". The user
    picks which columns correspond to date, amount, and description, then
    re-submits the same file alongside the mapping via multipart form.
    """
    uid = user["user_id"]

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Please upload a .csv file")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5 MB)")

    from core.csv_importer import parse_csv

    column_override = {
        "date_column": date_column,
        "amount_column": amount_column,
        "description_column": description_column or None,
    }

    result = parse_csv(contents, uid, column_override=column_override)

    if result["status"] == "error":
        raise HTTPException(422, result.get("error", "Could not parse CSV with provided mapping"))

    await _stage_csv(uid, result["transactions"])
    logger.info(
        "CSV preview (manual mapping): %d transactions staged for user %s",
        len(result["transactions"]),
        uid[:8],
    )

    return {
        "status": "preview",
        "count": result["count"],
        "duplicates_removed": result.get("duplicates_removed", 0),
        "detected_format": result["detected_format"],
        "transactions": [
            {
                "id": t["id"],
                "date": t["date"],
                "amount": t["amount"],
                "merchant": t["merchant"],
                "category": t["category"],
            }
            for t in result["transactions"]
        ],
    }


# ── Plaid Bank Link (stubs — requires PLAID_CLIENT_ID and PLAID_SECRET) ──────

@router.post("/api/connections/plaid/link")
async def create_plaid_link_token(user: dict = Depends(get_current_user)):
    """
    Create a Plaid Link token to initialize the bank connection flow.

    The frontend opens the Plaid Link modal with this token. After the
    user connects their bank, Plaid returns a public_token which is
    exchanged via POST /api/connections/plaid/exchange.

    Requires PLAID_CLIENT_ID and PLAID_SECRET in .env.
    """
    if not PLAID_ENABLED:
        raise HTTPException(
            503,
            "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in .env to enable bank linking.",
        )

    # Implementation will go here once plaid-python is installed:
    #
    # from plaid.api import plaid_api
    # from plaid.model.link_token_create_request import LinkTokenCreateRequest
    # from plaid.model.products import Products
    #
    # request = LinkTokenCreateRequest(
    #     user={"client_user_id": user["user_id"]},
    #     client_name="orryon",
    #     products=[Products("transactions")],
    #     country_codes=["US"],
    #     language="en",
    # )
    # response = client.link_token_create(request)
    # return {"link_token": response.link_token}

    raise HTTPException(501, "Plaid integration is not yet implemented. Use CSV import for now.")


@router.post("/api/connections/plaid/exchange")
async def exchange_plaid_token(user: dict = Depends(get_current_user)):
    """
    Exchange a Plaid public_token for a persistent access_token.

    Called after the user completes the Plaid Link flow in the frontend.
    The access_token is stored securely and used for transaction sync.
    """
    if not PLAID_ENABLED:
        raise HTTPException(503, "Plaid is not configured.")

    # Implementation will exchange public_token -> access_token and
    # store it in the users table (encrypted if ENCRYPTION_KEY is set).

    raise HTTPException(501, "Plaid token exchange is not yet implemented.")
