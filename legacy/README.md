# Legacy Streamlit stack (maintenance mode)

The **primary product** is:

- **UI:** `frontend/` (Next.js)
- **API:** `backend/` (FastAPI)
- **AI:** `core/grok_agent.py` + `core/tools/`

## Deprecated paths

| Path | Status |
|------|--------|
| `app.py` | Legacy Streamlit entry — do not add features here |
| `ui/` | Streamlit widgets used only by `app.py` |
| `pages/` | Streamlit legal/marketing pages |

These still call `core/` directly (no FastAPI). They duplicate chat/session logic
from `backend/routers/chat.py` and increase maintenance cost.

## Guidance

- New features: **Next.js + FastAPI only**
- Bug fixes in Streamlit: only if a user is blocked; prefer migrating the flow to the modern stack
- To run legacy UI (local): `streamlit run app.py` from repo root
