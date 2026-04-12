"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { SwipeToDelete } from "@/components/swipe-to-delete";

interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  description: string;
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

function typeLabel(t: string) {
  if (t === "bill_due") return "Bill";
  if (t === "reminder") return "Reminder";
  if (t === "errand") return "Errand";
  if (t === "task") return "Task";
  return "Event";
}

export function TodayTab() {
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTask, setNewTask] = useState("");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    Promise.all([
      api.get<Event[]>("/api/events?upcoming=true&limit=50"),
      api.get<Task[]>("/api/tasks?status=open"),
    ]).then(([e, t]) => {
      setEvents(e.filter((ev) => ev.event_date.startsWith(today)));
      setTasks(t.filter((tk) => tk.due_date === today));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [today]);

  const addTask = () => {
    if (!newTask.trim()) return;
    api.post("/api/tasks", { title: newTask.trim(), due_date: today }).then(() => {
      setTasks((prev) => [...prev, { id: Date.now().toString(), title: newTask.trim(), priority: "medium", status: "open", due_date: today, category: "general" }]);
      setNewTask("");
      setAdding(false);
    }).catch(() => {});
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  const empty = events.length === 0 && tasks.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <button onClick={() => setAdding((v) => !v)} className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition">
          {adding ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} /> : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />}
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-4">
          <input
            autoFocus
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add a task for today…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <button onClick={addTask} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add</button>
        </div>
      )}

      {empty && !adding && (
        <p className="text-white/30 text-sm py-6 text-center">Nothing scheduled for today. Enjoy the day.</p>
      )}

      {tasks.length > 0 && (
        <div className="mb-6">
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Due Today</p>
          {tasks.map((t) => (
            <SwipeToDelete key={t.id} onDelete={() => api.delete(`/api/tasks/${t.id}`).then(() => setTasks((prev) => prev.filter((x) => x.id !== t.id))).catch(() => {})}>
              <div className="flex items-center gap-3 py-2.5 border-b border-white/5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot(t.priority)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{t.title}</p>
                  <p className="text-[0.65rem] text-white/25">{t.priority} priority · {t.category || "general"}</p>
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
            </SwipeToDelete>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Today's Events</p>
          {events.map((e) => (
            <SwipeToDelete key={e.id} onDelete={() => api.delete(`/api/events/${e.id}`).then(() => setEvents((prev) => prev.filter((x) => x.id !== e.id))).catch(() => {})}>
              <div className="flex items-start gap-3 py-2.5 border-b border-white/5">
                <span className="text-[0.6rem] uppercase tracking-wide text-white/30 mt-1 w-12 shrink-0">{typeLabel(e.event_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{e.title}</p>
                  {e.description && <p className="text-[0.7rem] text-white/25 mt-0.5">{e.description}</p>}
                </div>
              </div>
            </SwipeToDelete>
          ))}
        </div>
      )}
    </div>
  );
}
