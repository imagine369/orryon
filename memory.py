"""
memory.py — Long-term per-user agent memory backed by ChromaDB.

Architecture
────────────
  Embeddings : sentence-transformers all-MiniLM-L6-v2  (local, 22 MB, no API)
  Vector DB  : ChromaDB persisted to ./chroma_db/
  LLM        : Grok via xAI (unchanged — only used for reasoning in agents)

One ChromaDB collection per user: "user_{user_id}_memory".
Memories are extracted from agent responses and recalled semantically before
each new query, so the agent builds a growing profile of each user's goals,
preferences, decisions, and financial patterns.

Public API
──────────
  store_memory(user_id, text, metadata)        — persist a memory fragment
  retrieve_relevant_memories(user_id, query)   — top-N semantically similar memories
  extract_memory_facts(query, response_text)   — heuristic extraction of key facts
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# ── ChromaDB + embeddings (graceful degradation if not installed) ─────────────

_CHROMA_AVAILABLE = False
_chroma_client: Any = None
_embedding_fn: Any = None

try:
    import chromadb
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

    _embedding_fn = SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )
    _chroma_client = chromadb.PersistentClient(path="./chroma_db")
    _CHROMA_AVAILABLE = True
    logger.info("ChromaDB long-term memory enabled (all-MiniLM-L6-v2 embeddings).")
except Exception as _mem_err:
    logger.warning(
        "ChromaDB/sentence-transformers not available — long-term memory disabled. "
        "Install with: pip install chromadb sentence-transformers  (%s)",
        _mem_err,
    )


# ── Collection helper ─────────────────────────────────────────────────────────

def _get_collection(user_id: str):
    """Return (or create) the ChromaDB collection for *user_id*."""
    if not _CHROMA_AVAILABLE or _chroma_client is None:
        return None
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", user_id)
    collection_name = f"user_{safe_id}_memory"
    return _chroma_client.get_or_create_collection(
        name=collection_name,
        embedding_function=_embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )


# ── Public API ────────────────────────────────────────────────────────────────

def store_memory(
    user_id: str,
    text: str,
    metadata: dict | None = None,
) -> None:
    """
    Store a memory fragment for *user_id*.

    Args:
        user_id:  The authenticated user's UUID.
        text:     The memory content (a sentence or short paragraph).
        metadata: Optional dict — type, query, timestamp, confidence.
    """
    if not text or not text.strip():
        return
    collection = _get_collection(user_id)
    if collection is None:
        return
    meta = {
        "type": "fact",
        "timestamp": datetime.utcnow().isoformat(),
        **(metadata or {}),
    }
    try:
        collection.add(
            documents=[text.strip()],
            metadatas=[meta],
            ids=[str(uuid.uuid4())],
        )
    except Exception as exc:
        logger.error("store_memory error: %s", exc)


def retrieve_relevant_memories(
    user_id: str,
    query: str,
    n_results: int = 5,
) -> str:
    """
    Return the top-N memories most semantically relevant to *query* as a
    formatted string ready to be prepended to a task description.
    Returns an empty string if no memories exist or ChromaDB is unavailable.
    """
    collection = _get_collection(user_id)
    if collection is None or not query:
        return ""
    try:
        count = collection.count()
        if count == 0:
            return ""
        results = collection.query(
            query_texts=[query],
            n_results=min(n_results, count),
        )
        docs: list[str] = results.get("documents", [[]])[0]
        metas: list[dict] = results.get("metadatas", [[]])[0]
        if not docs:
            return ""
        lines = []
        for doc, meta in zip(docs, metas):
            ts = meta.get("timestamp", "")[:10]
            mem_type = meta.get("type", "fact")
            lines.append(f"- [{mem_type} • {ts}] {doc}")
        return "\n".join(lines)
    except Exception as exc:
        logger.error("retrieve_relevant_memories error: %s", exc)
        return ""


# ── Memory extraction heuristics ──────────────────────────────────────────────

_GOAL_PATTERNS = re.compile(
    r"(i want|my goal|i('d| would) like|i plan|i need|i('m| am) trying|"
    r"decided to|i prefer|i('ll| will)|let('s| us)|"
    r"retire|save|invest|cut|reduce|increase|pay off|budget|"
    r"emergency fund|net worth|my income|my salary|i earn|i spend|"
    r"my mortgage|my rent|my debt|my loan|my credit)",
    re.IGNORECASE,
)


def extract_memory_facts(query: str, response_text: str) -> list[str]:
    """
    Heuristically extract memory-worthy sentences from the user query and the
    agent's response text.

    Looks for:
    • User-stated goals, preferences, or financial facts in *query*
    • Agent-identified patterns, recommendations accepted, or key decisions
      in *response_text* (lines starting with Thought/Plan/Action are skipped)

    Returns a list of short strings (one per memory fragment).
    """
    candidates: list[str] = []

    # Always try to capture the user's query as a goal/preference
    query_stripped = query.strip()
    if query_stripped and _GOAL_PATTERNS.search(query_stripped):
        candidates.append(f"User said: {query_stripped}")

    # Scan response sentences (skip reasoning header lines)
    skip_prefixes = ("thought:", "plan:", "action:", "{", "}", '"status"', '"summary"')
    for raw_line in response_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if any(line.lower().startswith(p) for p in skip_prefixes):
            continue
        # Only keep sentences that contain goal/preference language
        if _GOAL_PATTERNS.search(line) and len(line) > 20:
            candidates.append(line)

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for c in candidates:
        key = c[:80].lower()
        if key not in seen:
            seen.add(key)
            unique.append(c)

    return unique[:8]  # cap at 8 fragments per turn
