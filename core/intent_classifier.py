"""
Lightweight locale-aware intent detection for tool re-prompt gating.
"""
from __future__ import annotations

import re

from core.agent_shared import _ACTION_VERB_RE, _LIVE_NEWS_QUERY_RE

# Action / query cues by ISO 639-1 code (subset of settings languages).
_LOCALE_ACTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "es": re.compile(
        r"\b("
        r"gast[eé]|compr[eé]|pag[ué]|agregar|añadir|anadir|registrar|apuntar|"
        r"recordar|programar|crear|editar|cambiar|borrar|eliminar|cancelar|"
        r"completar|marcar|mostrar|lista|buscar|cu[aá]nto|cu[aá]ntos|"
        r"resumen|pron[oó]stico|presupuesto|gasto"
        r")\b",
        re.IGNORECASE,
    ),
    "fr": re.compile(
        r"\b("
        r"d[eé]pens[eé]|achet[eé]|ajouter|enregistrer|noter|planifier|cr[eé]er|"
        r"modifier|supprimer|effacer|annuler|terminer|cocher|afficher|liste|"
        r"chercher|combien|r[eé]sum[eé]|pr[eé]vision|budget"
        r")\b",
        re.IGNORECASE,
    ),
    "de": re.compile(
        r"\b("
        r"ausgegeben|gekauft|bezahlt|hinzuf[uü]gen|eintragen|erinnern|planen|"
        r"erstellen|bearbeiten|l[oö]schen|entfernen|abbrechen|erledigen|"
        r"anzeigen|liste|suchen|wie\s+viel|zusammenfassung|prognose|budget"
        r")\b",
        re.IGNORECASE,
    ),
    "pt": re.compile(
        r"\b("
        r"gastei|comprei|paguei|adicionar|registrar|lembrar|agendar|criar|"
        r"editar|alterar|excluir|apagar|cancelar|concluir|marcar|mostrar|lista|"
        r"buscar|quanto|quantos|resumo|previs[aã]o|or[cç]amento"
        r")\b",
        re.IGNORECASE,
    ),
    "it": re.compile(
        r"\b("
        r"speso|comprato|pagato|aggiungere|registrare|ricordare|programmare|"
        r"creare|modificare|cancellare|eliminare|completare|mostra|lista|cerca|"
        r"quanto|quanti|riepilogo|previsione|budget"
        r")\b",
        re.IGNORECASE,
    ),
}

_LOCALE_NEWS_PATTERNS: dict[str, re.Pattern[str]] = {
    "es": re.compile(r"\b(noticias|titulares|actualidad|qu[eé] pasa hoy)\b", re.IGNORECASE),
    "fr": re.compile(r"\b(actualit[eé]s|nouvelles|titres|quoi de neuf)\b", re.IGNORECASE),
    "de": re.compile(r"\b(nachrichten|schlagzeilen|was ist neu)\b", re.IGNORECASE),
    "pt": re.compile(r"\b(not[ií]cias|manchetes|o que h[aá] de novo)\b", re.IGNORECASE),
    "it": re.compile(r"\b(notizie|titoli|cosa c[eè] di nuovo)\b", re.IGNORECASE),
}

# CJK: short keyword lists checked via substring (regex word boundaries are unreliable).
_CJK_ACTION_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ja": ("追加", "記録", "登録", "削除", "予定", "リマインド", "表示", "一覧", "いくら", "予算", "支出"),
    "zh": ("添加", "记录", "登记", "删除", "提醒", "显示", "列表", "多少", "预算", "支出"),
    "ko": ("추가", "기록", "등록", "삭제", "일정", "알림", "표시", "목록", "얼마", "예산", "지출"),
}

_CJK_NEWS_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ja": ("ニュース", "速報", "今日のニュース"),
    "zh": ("新闻", "头条", "今日新闻"),
    "ko": ("뉴스", "속보", "오늘 뉴스"),
}


def _normalize_language(language: str | None) -> str:
    if not language:
        return "en"
    return language.strip().lower().replace("_", "-").split("-")[0]


def message_suggests_tool_action(text: str, language: str | None = "en") -> bool:
    """True when the user message likely requires a tool call."""
    if not text or not text.strip():
        return False
    lang = _normalize_language(language)
    if lang == "en":
        return bool(_ACTION_VERB_RE.search(text))
    pattern = _LOCALE_ACTION_PATTERNS.get(lang)
    if pattern and pattern.search(text):
        return True
    keywords = _CJK_ACTION_KEYWORDS.get(lang)
    if keywords and any(k in text for k in keywords):
        return True
    # Unknown locale: fall back to English heuristics (better than never re-prompting).
    return bool(_ACTION_VERB_RE.search(text))


def message_is_live_news_query(text: str, language: str | None = "en") -> bool:
    if not text:
        return False
    lang = _normalize_language(language)
    if lang == "en":
        return bool(_LIVE_NEWS_QUERY_RE.search(text))
    pattern = _LOCALE_NEWS_PATTERNS.get(lang)
    if pattern and pattern.search(text):
        return True
    keywords = _CJK_NEWS_KEYWORDS.get(lang)
    if keywords and any(k in text for k in keywords):
        return True
    return bool(_LIVE_NEWS_QUERY_RE.search(text))
