"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

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

const DEMO_EVENTS: CalEvent[] = [
  { id: "1", title: "Doctor appointment", event_date: "2026-04-14", event_type: "event",    description: "Annual checkup"        },
  { id: "2", title: "Lunch with team",    event_date: "2026-04-16", event_type: "event",    description: "Noon at the usual spot" },
  { id: "3", title: "Pay rent",           event_date: "2026-04-20", event_type: "bill_due", description: ""                       },
  { id: "4", title: "Birthday party",     event_date: "2026-04-25", event_type: "event",    description: "Sarah's birthday"       },
];

const DEMO_TASKS: CalTask[] = [
  { id: "1", title: "Pay credit card bill", priority: "high",   status: "open", due_date: "2026-04-12", category: "finance" },
  { id: "2", title: "Call dentist",         priority: "medium", status: "open", due_date: "2026-04-15", category: "health"  },
  { id: "3", title: "Review budget",        priority: "low",    status: "open", due_date: "2026-04-30", category: "finance" },
];

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

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

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

export function CalendarTab() {
  const [events, setEvents]   = useState<CalEvent[]>([]);
  const [tasks, setTasks]     = useState<CalTask[]>([]);
  const [loading, setLoading] = useState(true);

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
