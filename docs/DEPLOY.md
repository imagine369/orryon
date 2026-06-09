# Deploy checklist

## Production required variables

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `JWT_SECRET` | 64+ char random hex | Session + signing key derivation |
| `REQUEST_SIGNING_MODE` | `enforce` | **Required** — boot fails otherwise |
| `XAI_API_KEY` | your key | |
| `DB_PATH` | `/data/finance.db` | SQLite on Railway volume mounted at `/data` only |
| `FRONTEND_URL` / `APP_URL` | `https://www.orryon.com` | |

**Unset** `DATABASE_URL` unless using Postgres. **Unset** `DISABLE_REQUEST_SIGNING` in production.

## Request signing verification

Expensive routes require HMAC signatures in production:

- `POST /api/chat`
- `POST /api/voice/stt`
- `POST /api/voice/tts`
- `POST /api/voice/orb-tts`

After deploy:

```bash
.venv/bin/python backend/scripts/verify_signing.py
```

Expect: unsigned `/api/chat` → 401; signed request → accepted.

## Safety guardrails (Phase 6)

- **Destructive deletes:** confirmed in chat (`confirm_required` → user confirms → `user_confirmed=true`). Audit log: `GET /api/audit/history`.
- **Content policy:** server-side checks in `core/content_policy.py` before LLM (porn, substantial code, image generation).
- **HITL queue:** `/api/approvals/*` pending endpoints only when `APPROVALS_HITL_ENABLED=1` — not used for delete tools today.

See also [RAILWAY.md](../RAILWAY.md) for volume mount and healthcheck troubleshooting.
