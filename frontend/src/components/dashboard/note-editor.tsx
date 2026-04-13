"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Pin, PinOff } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

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

interface NoteEditorProps {
  note: Note;
  onClose: (updated: Note) => void;
}

export function NoteEditor({ note, onClose }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || "");
  const [isPinned, setIsPinned] = useState(!!note.is_pinned);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback((t: string, c: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.patch(`/api/notes/${note.id}`, { title: t, content: c }).then(() => {
        setSaved(true);
      }).catch(() => {});
    }, 800);
  }, [note.id]);

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    api.patch(`/api/notes/${note.id}`, { is_pinned: next ? 1 : 0 }).catch(() => {});
  };

  const handleClose = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Final save on close
    api.patch(`/api/notes/${note.id}`, { title, content }).catch(() => {});
    onClose({ ...note, title, content, is_pinned: isPinned ? 1 : 0 });
  };

  // Auto-resize textareas
  useEffect(() => {
    const resize = (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };
    resize(titleRef.current);
    resize(contentRef.current);
  }, [title, content]);

  const formattedDate = new Date(note.created_at).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed inset-0 z-50 bg-[#0d0d0d] flex flex-col"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          <span className="text-sm">Journal</span>
        </button>

        <div className="flex items-center gap-3">
          {!saved && <span className="text-[0.6rem] text-white/20">Saving…</span>}
          {saved && <span className="text-[0.6rem] text-white/15">Saved</span>}
          <button
            onClick={togglePin}
            className={`transition ${isPinned ? "text-yellow-400" : "text-white/30 hover:text-white/60"}`}
          >
            {isPinned
              ? <Pin className="h-4 w-4" strokeWidth={1.5} />
              : <PinOff className="h-4 w-4" strokeWidth={1.5} />
            }
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-[0.65rem] text-white/20 mb-3">{formattedDate}</p>

        {/* Title */}
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => { setTitle(e.target.value); save(e.target.value, content); }}
          placeholder="Title"
          rows={1}
          className="w-full bg-transparent text-white text-2xl font-semibold placeholder:text-white/15 outline-none resize-none mb-3 leading-snug"
        />

        {/* Divider */}
        <div className="border-t border-white/5 mb-4" />

        {/* Content */}
        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); save(title, e.target.value); }}
          placeholder="Start writing…"
          rows={6}
          className="w-full bg-transparent text-white/70 text-[0.95rem] leading-relaxed placeholder:text-white/15 outline-none resize-none"
        />
      </div>
    </motion.div>
  );
}
