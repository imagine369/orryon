"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { NoteEditor } from "@/components/dashboard/note-editor";

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

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

const DEMO_NOTES: Note[] = [
  { id: "1", title: "Q2 Financial Goals",      content: "Review investment portfolio and rebalance. Increase 401k contributions by 2%. Look into index funds.", tags: "finance", mood: "", is_pinned: 1, linked_goal: "", created_at: "2026-04-08T10:00:00Z", updated_at: "2026-04-08T10:00:00Z" },
  { id: "2", title: "Meal prep ideas",          content: "Chicken, rice, vegetables for the week. Try the new Mediterranean bowl recipe.", tags: "", mood: "", is_pinned: 0, linked_goal: "", created_at: "2026-04-06T09:00:00Z", updated_at: "2026-04-06T09:00:00Z" },
  { id: "3", title: "Book recommendations",     content: "The Psychology of Money, Die with Zero, The Almanack of Naval Ravikant, Atomic Habits.", tags: "books", mood: "", is_pinned: 0, linked_goal: "", created_at: "2026-04-03T14:00:00Z", updated_at: "2026-04-03T14:00:00Z" },
];

export function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [openNote, setOpenNote] = useState<Note | null>(null);

  useEffect(() => {
    if (isDemo()) { setNotes(DEMO_NOTES); setLoading(false); return; }
    api.get<Note[]>("/api/notes").then(setNotes).catch(() => {}).finally(() => setLoading(false));
  }, []);

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

  const pinned = notes.filter((n) => n.is_pinned);
  const unpinned = notes.filter((n) => !n.is_pinned);

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  const NoteRow = ({ n }: { n: Note }) => (
    <SwipeToDelete onDelete={() => api.delete(`/api/notes/${n.id}`).then(() => setNotes((prev) => prev.filter((x) => x.id !== n.id))).catch(() => {})}>
      <button
        onClick={() => setOpenNote(n)}
        className="w-full text-left py-3 border-b border-white/5 active:bg-white/[0.02] transition"
      >
        <div className="flex items-baseline justify-between mb-0.5">
          <p className="text-sm font-semibold text-white/85 truncate flex-1 pr-3">{n.title || "Untitled"}</p>
          <span className="text-[0.6rem] text-white/25 shrink-0">{smartDate(n.updated_at || n.created_at)}</span>
        </div>
        <p className="text-[0.78rem] text-white/35 truncate">
          {n.content ? n.content.split("\n")[0] : <span className="text-white/20 italic">No content</span>}
        </p>
      </button>
    </SwipeToDelete>
  );

  return (
    <>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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
