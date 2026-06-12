"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Upload, Check, Loader2, X, Plus, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { localDateStr } from "@/lib/utils";
import { isDemo, DEMO_EVENTS, DEMO_TASKS } from "./demo-data";
import { scheduleDataChanged, useDataRefresh } from "@/lib/use-data-refresh";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { EventDetailSheet, type EventFormData } from "./event-detail-sheet";
import { eventsInMonth, eventDateKey, fmtEventTime, monthRange, mergeEventsWithPendingOptimistic, calendarCrudErrorMessage } from "./calendar-tab-helpers";

interface CalEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  description: string;
}

interface CalTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string;
  category: string;
}

type SheetState =
  | { mode: "create" }
  | { mode: "edit"; event: CalEvent }
  | null;

const EVENT_COLOR: Record<string, string> = {
  event:    "#60a5fa",
  bill_due: "#f87171",
  reminder: "#fbbf24",
  errand:   "#34d399",
  task:     "#a78bfa",
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   "#f87171",
  medium: "#fb923c",
  low:    "#60a5fa",
  none:   "#555555",
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toDateStr(d: Date) {
  return localDateStr(d);
}

function fmtDayLabel(dateStr: string, today: string) {
  const d = new Date(dateStr + "T12:00:00");
  const diff = Math.round((d.getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
  const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  if (diff === 0) return `Today · ${dateLabel}`;
  if (diff === 1) return `Tomorrow · ${dateLabel}`;
  if (diff === -1) return `Yesterday · ${dateLabel}`;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

type ImportStatus = "idle" | "loading" | "success" | "error";

export function CalendarTab() {
  const [events, setEvents]   = useState<CalEvent[]>([]);
  const [tasks, setTasks]     = useState<CalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet]     = useState<SheetState>(null);
  const [crudError, setCrudError] = useState("");

  // ICS import state
  const fileRef                         = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMsg, setImportMsg]       = useState("");

  const now   = new Date();
  const today = toDateStr(now);

  const [monthYear, setMonthYear]   = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(today);

  const crudErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (crudErrorTimerRef.current) clearTimeout(crudErrorTimerRef.current);
  }, []);

  const showCrudError = useCallback((message: string) => {
    setCrudError(message);
    if (crudErrorTimerRef.current) clearTimeout(crudErrorTimerRef.current);
    crudErrorTimerRef.current = setTimeout(() => {
      setCrudError("");
      crudErrorTimerRef.current = null;
    }, 4000);
  }, []);

  const dismissCrudError = useCallback(() => {
    setCrudError("");
    if (crudErrorTimerRef.current) {
      clearTimeout(crudErrorTimerRef.current);
      crudErrorTimerRef.current = null;
    }
  }, []);

  const eventsQuery = useCallback((year: number, month: number) => {
    const { from, to } = monthRange(year, month);
    return `/api/events?from_date=${from}&to_date=${to}&limit=200`;
  }, []);

  const reload = useCallback((opts?: { silent?: boolean }) => {
    if (isDemo()) {
      setEvents(eventsInMonth(DEMO_EVENTS, monthYear.year, monthYear.month));
      setTasks(DEMO_TASKS);
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    Promise.all([
      api.get<CalEvent[]>(eventsQuery(monthYear.year, monthYear.month)),
      api.get<CalTask[]>("/api/tasks?status=open"),
    ])
      .then(([e, t]) => {
        setEvents((prev) =>
          mergeEventsWithPendingOptimistic(Array.isArray(e) ? e : [], prev),
        );
        setTasks(Array.isArray(t) ? t : []);
      })
      .catch((err: unknown) =>
        showCrudError(calendarCrudErrorMessage(err, "Couldn't load calendar. Please try again.")),
      )
      .finally(() => setLoading(false));
  }, [monthYear, eventsQuery, showCrudError]);

  useQueuedEffect(() => reload(), [reload]);
  useDataRefresh(["calendar", "schedule", "dashboard"], () => reload({ silent: true }));

  const handleIcsUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".ics")) {
      setImportMsg("Please select a .ics file.");
      setImportStatus("error");
      return;
    }
    setImportStatus("loading");
    setImportMsg("");
    try {
      const data = await api.upload<{ message: string }>("/api/calendar/import/ics", file);
      setImportMsg(data.message);
      setImportStatus("success");
      const fresh = await api.get<CalEvent[]>(eventsQuery(monthYear.year, monthYear.month));
      setEvents(Array.isArray(fresh) ? fresh : []);
      scheduleDataChanged(["calendar", "today", "schedule", "dashboard"]);
      setTimeout(() => setImportStatus("idle"), 4000);
    } catch (err: unknown) {
      setImportMsg(calendarCrudErrorMessage(err, "Import failed."));
      setImportStatus("error");
    }
  };

  const deleteEvent = (id: string) => {
    const removed = events.find((e) => e.id === id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setSheet(null);
    if (isDemo()) return;
    api.delete(`/api/events/${id}`)
      .then(() => scheduleDataChanged(["calendar", "today", "schedule", "dashboard"]))
      .catch((err: unknown) => {
        if (removed) setEvents((prev) => [...prev, removed]);
        showCrudError(calendarCrudErrorMessage(err, "Couldn't delete event. Please try again."));
      });
  };

  const saveEvent = (data: EventFormData) => {
    if (sheet?.mode === "create") {
      const optimistic: CalEvent = {
        id: `tmp-${Date.now()}`,
        title: data.title,
        event_date: data.allDay ? data.date : `${data.date} ${data.time}`,
        event_type: "event",
        description: data.description,
      };
      setEvents((prev) => [...prev, optimistic]);
      setSheet(null);
      if (isDemo()) return;
      api.post<{ id: string }>("/api/events", {
        title: data.title,
        date: data.date,
        time: data.allDay ? "" : data.time,
        description: data.description,
        event_type: "event",
      })
        .then((res) => {
          setEvents((prev) =>
            prev.map((e) => (e.id === optimistic.id ? { ...optimistic, id: res.id } : e)),
          );
          scheduleDataChanged(["calendar", "today", "schedule", "dashboard"]);
        })
        .catch((err: unknown) => {
          setEvents((prev) => prev.filter((e) => e.id !== optimistic.id));
          showCrudError(calendarCrudErrorMessage(err, "Couldn't save event. Please try again."));
        });
      return;
    }

    if (sheet?.mode === "edit") {
      const { event } = sheet;
      const eventDate = data.allDay ? data.date : `${data.date} ${data.time}`;
      const updated: CalEvent = {
        ...event,
        title: data.title,
        event_date: eventDate,
        description: data.description,
      };
      setEvents((prev) =>
        eventsInMonth(
          prev.map((e) => (e.id === event.id ? updated : e)),
          monthYear.year,
          monthYear.month,
        ),
      );
      setSheet(null);
      if (isDemo()) return;
      api.patch(`/api/events/${event.id}`, {
        title: data.title,
        date: data.date,
        time: data.allDay ? "" : data.time,
        description: data.description,
      })
        .then(() => scheduleDataChanged(["calendar", "today", "schedule", "dashboard"]))
        .catch((err: unknown) => {
          setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
          showCrudError(calendarCrudErrorMessage(err, "Couldn't save event. Please try again."));
        });
    }
  };

  const calCells = useMemo(() => {
    const { year, month } = monthYear;
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthYear]);

  const monthLabel = useMemo(() =>
    new Date(monthYear.year, monthYear.month, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  [monthYear]);

  const stepMonth = (dir: number) =>
    setMonthYear(({ year, month }) => {
      const d = new Date(year, month + dir, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const datesWithItems = useMemo(() => {
    const map = new Map<string, string[]>();
    events.forEach((e) => {
      const ds = eventDateKey(e.event_date);
      if (!map.has(ds)) map.set(ds, []);
      map.get(ds)!.push(EVENT_COLOR[e.event_type] ?? "#60a5fa");
    });
    tasks.forEach((t) => {
      if (!t.due_date) return;
      if (!map.has(t.due_date)) map.set(t.due_date, []);
      map.get(t.due_date)!.push(PRIORITY_COLOR[t.priority] ?? "#555");
    });
    return map;
  }, [events, tasks]);

  const dayEvents = events.filter((e) => eventDateKey(e.event_date) === selectedDate);
  const dayTasks  = tasks.filter((t) => t.due_date === selectedDate);

  const sheetKey = sheet
    ? sheet.mode === "create"
      ? `create-${selectedDate}`
      : `edit-${sheet.event.id}`
    : "closed";

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  return (
    <div>
      {/* ICS import */}
      {!isDemo() && (
        <div className="mb-4">
          <input
            ref={fileRef}
            type="file"
            accept=".ics"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIcsUpload(f); e.target.value = ""; }}
          />
          {importStatus === "success" ? (
            <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-xl px-3 py-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{importMsg}</span>
            </div>
          ) : importStatus === "error" ? (
            <div className="flex items-center justify-between gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
              <span>{importMsg}</span>
              <button onClick={() => setImportStatus("idle")}><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importStatus === "loading"}
              className="w-full flex items-center justify-center gap-2 text-xs text-white/30 hover:text-white/60
                         border border-white/8 hover:border-white/15 rounded-xl py-2.5 transition disabled:opacity-50"
            >
              {importStatus === "loading"
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                : <><Upload className="w-3.5 h-3.5" /> Import calendar (.ics)</>}
            </button>
          )}
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => stepMonth(-1)} className="p-1 text-white/25 hover:text-white/60 transition">
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <p className="text-sm font-semibold text-white/85">{monthLabel}</p>
        <button onClick={() => stepMonth(1)} className="p-1 text-white/25 hover:text-white/60 transition">
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label, i) => (
          <div key={i} className="text-center text-[0.55rem] font-medium text-white/20 py-1">{label}</div>
        ))}
      </div>

      {/* Full month grid */}
      <div className="grid grid-cols-7 gap-y-1 mb-5">
        {calCells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds     = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = ds === today;
          const isSel   = ds === selectedDate;
          const dots    = datesWithItems.get(ds) ?? [];
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 py-0.5">
              <button
                onClick={() => { setSelectedDate(ds); setSheet(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-xs transition-all duration-150"
                style={{
                  background:  isSel ? "white" : isToday ? "rgba(255,255,255,0.1)" : "transparent",
                  color:       isSel ? "black" : isToday ? "white" : "rgba(255,255,255,0.55)",
                  border:      isToday && !isSel ? "1px solid rgba(255,255,255,0.2)" : "none",
                  fontWeight:  isToday || isSel ? 700 : 400,
                }}
              >
                {day}
              </button>
              <div className="flex gap-[3px] h-1.5 items-center">
                {dots.slice(0, 3).map((color, j) => (
                  <span key={j} className="w-1 h-1 rounded-full" style={{ backgroundColor: isSel ? "transparent" : color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day detail */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <p className="text-[0.58rem] uppercase tracking-widest text-white/25 mb-3">
            {fmtDayLabel(selectedDate, today)}
          </p>

          {crudError && (
            <div className="flex items-center justify-between gap-2 mb-3 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
              <span>{crudError}</span>
              <button type="button" onClick={dismissCrudError} aria-label="Dismiss">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {dayEvents.map((e) => {
            const timeLabel = fmtEventTime(e.event_date);
            return (
              <button
                key={e.id}
                type="button"
                aria-label={`Edit ${e.title}`}
                onClick={() => setSheet({ mode: "edit", event: e })}
                className="w-full flex items-start gap-3 py-3 border-b border-white/5 text-left hover:bg-white/[0.02] active:bg-white/[0.04] transition"
              >
                <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ backgroundColor: EVENT_COLOR[e.event_type] ?? "#60a5fa" }} />
                <div className="flex-1 min-w-0">
                  {timeLabel && (
                    <p className="text-[0.65rem] text-white/35 mb-0.5">{timeLabel}</p>
                  )}
                  <p className="text-[16px] font-medium text-white/85 leading-snug">{e.title}</p>
                  {e.description && <p className="text-sm text-white/40 mt-0.5 line-clamp-2">{e.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 mt-0.5">
                  <span className="text-[0.55rem] text-white/20 uppercase tracking-wide">
                    {e.event_type.replace("_", " ")}
                  </span>
                  <span className="flex items-center gap-1 text-[0.6rem] text-white/30">
                    <Pencil className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                    Edit
                  </span>
                </div>
              </button>
            );
          })}

          {dayTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-3 border-b border-white/5">
              <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLOR[t.priority] ?? "#555" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[16px] text-white/85 truncate">{t.title}</p>
                <p className="text-sm text-white/35 mt-0.5">{t.category || "general"}</p>
              </div>
              <span className="text-[0.55rem] uppercase tracking-wide shrink-0" style={{ color: PRIORITY_COLOR[t.priority] ?? "#555", opacity: 0.7 }}>
                {t.priority === "none" ? "P4" : t.priority === "low" ? "P3" : t.priority === "medium" ? "P2" : "P1"}
              </span>
            </div>
          ))}

          {dayEvents.length === 0 && dayTasks.length === 0 && !sheet && (
            <p className="text-white/20 text-xs text-center py-6">Nothing scheduled</p>
          )}

          {!sheet && (
            <button
              type="button"
              onClick={() => setSheet({ mode: "create" })}
              className="flex items-center gap-2 mt-3 text-[0.65rem] text-white/20 hover:text-white/45 transition"
            >
              <Plus className="h-3 w-3" strokeWidth={1.5} />
              Add event
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      <EventDetailSheet
        key={sheetKey}
        open={sheet !== null}
        mode={sheet?.mode ?? "create"}
        defaultDate={selectedDate}
        initial={sheet?.mode === "edit" ? sheet.event : undefined}
        onSave={saveEvent}
        onDelete={sheet?.mode === "edit" ? () => deleteEvent(sheet.event.id) : undefined}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}
