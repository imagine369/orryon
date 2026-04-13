"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  description: string;
  reminder_minutes: number;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string;
  category: string;
}

function priorityDot(p: string) {
  if (p === "high") return "bg-red-400";
  if (p === "medium") return "bg-yellow-400";
  return "bg-green-400";
}

function typeIcon(t: string) {
  if (t === "bill_due") return "💳";
  if (t === "reminder") return "🔔";
  if (t === "errand") return "🏃";
  if (t === "task") return "✅";
  return "📅";
}

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

const DEMO_EVENTS: Event[] = [
  { id: "1", title: "Doctor appointment",  event_date: "2026-04-14", event_type: "event",    description: "Annual checkup", reminder_minutes: 60 },
  { id: "2", title: "Lunch with team",     event_date: "2026-04-16", event_type: "event",    description: "Noon at the usual spot", reminder_minutes: 30 },
  { id: "3", title: "Pay rent",            event_date: "2026-04-20", event_type: "bill_due", description: "",                reminder_minutes: 1440 },
  { id: "4", title: "Birthday party",      event_date: "2026-04-25", event_type: "event",    description: "Sarah's birthday", reminder_minutes: 60 },
];

const DEMO_TASKS: Task[] = [
  { id: "1", title: "Pay credit card bill", priority: "high",   status: "open", due_date: "2026-04-12", category: "finance" },
  { id: "2", title: "Call dentist",         priority: "medium", status: "open", due_date: "2026-04-15", category: "health" },
  { id: "3", title: "Review budget",        priority: "low",    status: "open", due_date: "2026-04-30", category: "finance" },
];

export function ScheduleTab() {
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo()) { setEvents(DEMO_EVENTS); setTasks(DEMO_TASKS); setLoading(false); return; }
    Promise.all([
      api.get<Event[]>("/api/events?upcoming=true&limit=20"),
      api.get<Task[]>("/api/tasks?status=open"),
    ]).then(([e, t]) => {
      setEvents(e);
      setTasks(t);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  return (
    <div>
      {/* Events */}
      <div className="mb-5">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Upcoming Events</p>
        {events.length === 0 ? (
          <p className="text-white/30 text-sm py-4">No upcoming events.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2.5 border-b border-white/5">
              <span className="text-base mt-0.5">{typeIcon(e.event_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/85">{e.title}</p>
                <p className="text-[0.7rem] text-white/30">{e.event_date}</p>
                {e.description && <p className="text-[0.7rem] text-white/20 mt-0.5">{e.description}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tasks */}
      <div>
        <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Tasks</p>
        {tasks.length === 0 ? (
          <p className="text-white/30 text-sm py-4">No open tasks.</p>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 py-2.5 border-b border-white/5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot(t.priority)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">{t.title}</p>
                <p className="text-[0.65rem] text-white/25">
                  {t.priority} · {t.category || "general"}{t.due_date ? ` · ${t.due_date}` : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  api.patch(`/api/tasks/${t.id}`, { status: "done" }).then(() => {
                    setTasks((prev) => prev.filter((x) => x.id !== t.id));
                  }).catch(() => {});
                }}
                className="text-[0.65rem] text-white/25 hover:text-green-400 transition shrink-0"
              >
                ✓ Done
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
