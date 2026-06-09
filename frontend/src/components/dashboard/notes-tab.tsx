"use client";

import { useEffect, useRef, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { Plus, Search, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { NoteEditor } from "@/components/dashboard/note-editor";
import { cn } from "@/lib/utils";
import { isDemo, DEMO_NOTES } from "./demo-data";
import { useDataRefresh } from "@/lib/use-data-refresh";

type NoteSort = "date" | "name";

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/25 text-inherit rounded-[2px] not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function contentSnippet(content: string, query: string): string {
  if (!content) return "";
  if (!query) return content.split("\n")[0];
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.split("\n")[0];
  const start = Math.max(0, idx - 25);
  const end   = Math.min(content.length, idx + query.length + 55);
  return (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
}

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string;
  mood: string;
  is_pinned: number;
  linked_goal: string;
  created_at: string;
  updated_at: string;
}

function smartDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [openNote, setOpenNote] = useState<Note | null>(null);
  const [noteSort, setNoteSort] = useState<NoteSort>("date");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const loadNotes = () => {
    if (isDemo()) { setNotes(DEMO_NOTES); setLoading(false); return; }
    api.get<Note[]>("/api/notes").then(setNotes).catch(() => {}).finally(() => setLoading(false));
  };

  useQueuedEffect(loadNotes, []);
  useDataRefresh(["notes", "journal"], loadNotes);

  const addNote = () => {
    if (!newTitle.trim()) return;
    const optimistic: Note = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      content: "",
      tags: "",
      mood: "",
      is_pinned: 0,
      linked_goal: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    api.post("/api/notes", { title: newTitle.trim() }).then(() => {
      setNotes((prev) => [optimistic, ...prev]);
      setNewTitle("");
      setAdding(false);
      // Open the new note immediately
      setOpenNote(optimistic);
    }).catch(() => {});
  };

  const handleEditorClose = (updated: Note) => {
    setNotes((prev) =>
      prev
        .map((n) => (n.id === updated.id ? updated : n))
        .sort((a, b) => b.is_pinned - a.is_pinned)
    );
    setOpenNote(null);
  };

  const sortNotes = (arr: Note[]) => {
    if (noteSort === "name") return [...arr].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return [...arr].sort((a, b) => {
      const da = a.updated_at || a.created_at || "";
      const db2 = b.updated_at || b.created_at || "";
      return db2 < da ? -1 : db2 > da ? 1 : 0;
    });
  };

  const q = query.trim().toLowerCase();

  const matchesQuery = (n: Note) =>
    !q ||
    (n.title || "").toLowerCase().includes(q) ||
    (n.content || "").toLowerCase().includes(q) ||
    (n.tags || "").toLowerCase().includes(q);

  const pinned   = sortNotes(notes.filter((n) => n.is_pinned && matchesQuery(n)));
  const unpinned = sortNotes(notes.filter((n) => !n.is_pinned && matchesQuery(n)));
  const searchResults = q ? sortNotes(notes.filter(matchesQuery)) : [];

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  const NoteRow = ({ n, highlight }: { n: Note; highlight?: string }) => {
    const snippet = contentSnippet(n.content, highlight || "");
    return (
      <SwipeToDelete onDelete={() => api.delete(`/api/notes/${n.id}`).then(() => setNotes((prev) => prev.filter((x) => x.id !== n.id))).catch(() => {})}>
        <button
          onClick={() => setOpenNote(n)}
          className="w-full text-left py-3 border-b border-white/5 active:bg-white/[0.02] transition"
        >
          <div className="flex items-baseline justify-between mb-0.5">
            <p className="text-sm font-semibold text-white/85 truncate flex-1 pr-3">
              <Highlight text={n.title || "Untitled"} query={highlight || ""} />
            </p>
            <span className="text-[0.6rem] text-white/25 shrink-0">{smartDate(n.updated_at || n.created_at)}</span>
          </div>
          <p className="text-[0.78rem] text-white/35 truncate">
            {snippet
              ? <Highlight text={snippet} query={highlight || ""} />
              : <span className="text-white/20 italic">No content</span>}
          </p>
        </button>
      </SwipeToDelete>
    );
  };

  return (
    <>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Notes</p>
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition"
          >
            {adding
              ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
              : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
            }
          </button>
        </div>

        {/* Sort pills — hidden while searching */}
        {!q && (
          <div className="flex gap-1 mt-1 mb-3">
            {(["date", "name"] as NoteSort[]).map((key) => (
              <button
                key={key}
                onClick={() => setNoteSort(key)}
                className={cn(
                  "text-[0.58rem] font-medium px-2 py-0.5 rounded-full border transition capitalize",
                  noteSort === key
                    ? "bg-white/10 border-white/20 text-white/80"
                    : "bg-transparent border-white/8 text-white/25 hover:border-white/20 hover:text-white/50",
                )}
              >
                {key === "date" ? "Recent" : "Name"}
              </button>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-3 mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25 pointer-events-none" strokeWidth={1.5} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full bg-white/5 rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:bg-white/[0.07] transition"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 rounded-full bg-white/15 hover:bg-white/25 transition"
            >
              <X className="h-2.5 w-2.5 text-white/60" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Add input */}
        {adding && (
          <div className="flex gap-2 mb-4">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Note title…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />
            <button onClick={addNote} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add</button>
          </div>
        )}

        {/* ── Search results (flat, highlighted) ── */}
        {q ? (
          <>
            {searchResults.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-white/25 text-sm">No notes match &ldquo;{query}&rdquo;</p>
              </div>
            ) : (
              <>
                <p className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-1 px-0.5">
                  {searchResults.length} {searchResults.length === 1 ? "note" : "notes"} found
                </p>
                {searchResults.map((n) => <NoteRow key={n.id} n={n} highlight={query} />)}
              </>
            )}
          </>
        ) : (
          <>
            {notes.length === 0 && !adding && (
              <p className="text-white/30 text-sm text-center py-8">No notes yet. Tap + to add one.</p>
            )}

            {/* Pinned section */}
            {pinned.length > 0 && (
              <div className="mb-2">
                <p className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-1 px-0.5">Pinned</p>
                {pinned.map((n) => <NoteRow key={n.id} n={n} />)}
              </div>
            )}

            {/* All notes */}
            {unpinned.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <p className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-1 mt-4 px-0.5">Notes</p>
                )}
                {unpinned.map((n) => <NoteRow key={n.id} n={n} />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Full-screen note editor */}
      <AnimatePresence>
        {openNote && (
          <NoteEditor note={openNote} onClose={handleEditorClose} />
        )}
      </AnimatePresence>
    </>
  );
}
