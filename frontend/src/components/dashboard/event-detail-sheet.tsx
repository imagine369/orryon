"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2 } from "lucide-react";

export interface EventFormData {
  title: string;
  date: string;
  time: string;
  allDay: boolean;
  description: string;
}

interface EventDetailSheetProps {
  open: boolean;
  mode: "create" | "edit";
  defaultDate: string;
  initial?: {
    title: string;
    event_date: string;
    description: string;
  };
  onSave: (data: EventFormData) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function parseEventDate(eventDate: string): { date: string; time: string; allDay: boolean } {
  const normalized = eventDate.trim().replace("T", " ");
  const date = normalized.slice(0, 10);
  const timePart = normalized.length > 10 ? normalized.slice(11, 16) : "";
  const time = /^\d{2}:\d{2}$/.test(timePart) ? timePart : "";
  return { date, time, allDay: !time };
}

export function EventDetailSheet({
  open,
  mode,
  defaultDate,
  initial,
  onSave,
  onDelete,
  onClose,
}: EventDetailSheetProps) {
  const parsed = initial ? parseEventDate(initial.event_date) : { date: defaultDate, time: "", allDay: true };

  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(parsed.date);
  const [time, setTime] = useState(parsed.time);
  const [allDay, setAllDay] = useState(parsed.allDay);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canSave = title.trim().length > 0 && (allDay || time.length > 0);

  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked);
    if (!checked && !time) setTime("09:00");
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed || (!allDay && !time)) return;
    onSave({ title: trimmed, date, time: allDay ? "" : time, allDay, description: description.trim() });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/85">
              {mode === "create" ? "New event" : "Edit event"}
            </p>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 text-white/30 hover:text-white/60 transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Event title"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 [color-scheme:dark]"
          />

          <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => handleAllDayChange(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            All day
          </label>

          {!allDay && (
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20 [color-scheme:dark]"
            />
          )}

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 resize-none"
          />

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-white/40 hover:text-white/70 transition"
            >
              Cancel
            </button>
          </div>

          {mode === "edit" && onDelete && (
            <div className="pt-1 border-t border-white/5">
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs text-white/50">
                    Delete &ldquo;{initial?.title}&rdquo;?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      aria-label="Confirm delete event"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/30 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 text-xs text-white/40 hover:text-white/70 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete event
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function fmtEventTime(eventDate: string): string | null {
  if (eventDate.length <= 10) return null;
  const time = eventDate.slice(11, 16);
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
