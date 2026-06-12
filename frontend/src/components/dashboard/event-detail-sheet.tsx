"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { parseEventDate } from "./calendar-tab-helpers";

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
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useQueuedEffect(() => {
    setContainer(document.body);
  }, []);

  useQueuedEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const canSave = title.trim().length > 0 && (allDay || time.length > 0);
  const heading = mode === "create" ? "New event" : "Edit event";

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

  if (!container) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="fixed inset-0 z-[200] bg-[#0d0d0d] flex flex-col isolate touch-manipulation"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-sheet-title"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              <span className="text-sm">Calendar</span>
            </button>
            <p id="event-detail-sheet-title" className="text-sm font-semibold text-white/85">
              {heading}
            </p>
            <div className="w-[88px]" aria-hidden="true" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Event title"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-white/20 [color-scheme:dark]"
            />

            <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer select-none min-h-[44px]">
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-white/20 [color-scheme:dark]"
              />
            )}

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 resize-none min-h-[100px]"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 px-3 py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40 min-h-[44px]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 text-sm text-white/40 hover:text-white/70 transition min-h-[44px]"
              >
                Cancel
              </button>
            </div>

            {mode === "edit" && onDelete && (
              <div className="pt-2 border-t border-white/5">
                {confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-xs text-white/50">
                      Delete &ldquo;{initial?.title}&rdquo;?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        aria-label="Confirm delete event"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-500/30 transition min-h-[44px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-4 py-3 text-sm text-white/40 hover:text-white/70 transition min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 text-sm text-red-400/70 hover:text-red-400 transition min-h-[44px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete event
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    container,
  );
}
