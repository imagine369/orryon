"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Upload, Check, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { isDemo, DEMO_EVENTS, DEMO_TASKS } from "./demo-data";

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
  return d.toISOString().split("T")[0];
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

  // ICS import state
  const fileRef                         = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMsg, setImportMsg]       = useState("");

  const now   = new Date();
  const today = toDateStr(now);

  const [monthYear, setMonthYear]   = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(today);

  useEffect(() => {
    if (isDemo()) { setEvents(DEMO_EVENTS); setTasks(DEMO_TASKS); setLoading(false); return; }
    Promise.all([
      api.get<CalEvent[]>("/api/events?upcoming=true&limit=100"),
      api.get<CalTask[]>("/api/tasks?status=open"),
    ]).then(([e, t]) => { setEvents(e); setTasks(t); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleIcsUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".ics")) {
      setImportMsg("Please select a .ics file.");
      setImportStatus("error");
      return;
    }
    setImportStatus("loading");
    setImportMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/calendar/import/ics`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("orryon_token") ?? ""}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Import failed.");
      setImportMsg(data.message);
      setImportStatus("success");
      // Reload events to show the new ones
      const fresh = await api.get<CalEvent[]>("/api/events?upcoming=true&limit=100");
      setEvents(fresh);
      setTimeout(() => setImportStatus("idle"), 4000);
    } catch (err: unknown) {
      setImportMsg(err instanceof Error ? err.message : "Import failed.");
      setImportStatus("error");
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

  // Map of date -> dot colors for the calendar grid
  const datesWithItems = useMemo(() => {
    const map = new Map<string, string[]>();
    events.forEach((e) => {
      const ds = e.event_date.slice(0, 10);
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

  // Only the selected day's items
  const dayEvents = events.filter((e) => e.event_date.startsWith(selectedDate));
  const dayTasks  = tasks.filter((t) => t.due_date === selectedDate);

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
                onClick={() => setSelectedDate(ds)}
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

      {/* Day detail — fades in/out when selectedDate changes */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDate}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {/* Day label */}
          <p className="text-[0.58rem] uppercase tracking-widest text-white/25 mb-3">
            {fmtDayLabel(selectedDate, today)}
          </p>

          {/* Events */}
          {dayEvents.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-3 border-b border-white/5">
              <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ backgroundColor: EVENT_COLOR[e.event_type] ?? "#60a5fa" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/85 leading-snug">{e.title}</p>
                {e.description && <p className="text-[0.68rem] text-white/30 mt-0.5">{e.description}</p>}
              </div>
              <span className="text-[0.55rem] text-white/20 shrink-0 mt-0.5 uppercase tracking-wide">
                {e.event_type.replace("_", " ")}
              </span>
            </div>
          ))}

          {/* Tasks */}
          {dayTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-3 border-b border-white/5">
              <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLOR[t.priority] ?? "#555" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">{t.title}</p>
                <p className="text-[0.62rem] text-white/25 mt-0.5">{t.category || "general"}</p>
              </div>
              <span className="text-[0.55rem] uppercase tracking-wide shrink-0" style={{ color: PRIORITY_COLOR[t.priority] ?? "#555", opacity: 0.7 }}>
                {t.priority === "none" ? "P4" : t.priority === "low" ? "P3" : t.priority === "medium" ? "P2" : "P1"}
              </span>
            </div>
          ))}

          {/* Empty state */}
          {dayEvents.length === 0 && dayTasks.length === 0 && (
            <p className="text-white/20 text-xs text-center py-6">Nothing scheduled</p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
