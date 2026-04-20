"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Settings, LayoutGrid, Bell, X, Search, Plus, Calendar, GripVertical, SlidersHorizontal, Flame, Feather,
} from "lucide-react";
import { BreathingWidget } from "@/components/dashboard/breathing-widget";
import { ListsTab } from "@/components/dashboard/lists-tab";
import { CalendarTab } from "@/components/dashboard/calendar-tab";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useDataRefresh } from "@/lib/use-data-refresh";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { SearchPanel } from "@/components/search-panel";
import { InstallButton } from "@/components/install-prompt";
import { usePanels } from "@/lib/panel-context";

// ── Priority system (Todoist-style) ─────────────────────────────────────────

const PRIORITY_CONFIG = {
  high:   { label: "P1", color: "#db4035", next: "medium" as const },
  medium: { label: "P2", color: "#ff9a14", next: "low"    as const },
  low:    { label: "P3", color: "#4073ff", next: "none"   as const },
  none:   { label: "P4", color: "#555555", next: "high"   as const },
} as const;
type PriorityKey = keyof typeof PRIORITY_CONFIG;

function priorityBorderColor(priority: string) {
  return PRIORITY_CONFIG[priority as PriorityKey]?.color ?? PRIORITY_CONFIG.none.color;
}

type TaskSort = "priority" | "date" | "name" | "manual";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

// ── Demo data ────────────────────────────────────────────────────────────────

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

const TODAY = new Date().toISOString().split("T")[0];

const DEMO_TASKS: Task[] = [
  { id: "dt1", title: "Review Q2 budget report",         priority: "high",   due_date: TODAY, status: "open" },
  { id: "dt2", title: "Call with accountant at 3pm",     priority: "high",   due_date: TODAY, status: "open" },
  { id: "dt3", title: "Send weekly update to team",      priority: "medium", due_date: TODAY, status: "open" },
  { id: "dt4", title: "Book flight to NYC",              priority: "medium", due_date: TODAY, status: "open" },
  { id: "dt5", title: "Review gym membership renewal",   priority: "low",    due_date: TODAY, status: "open" },
  { id: "dt6", title: "Pick up dry cleaning",            priority: "none",   due_date: TODAY, status: "open" },
];

const DEMO_EVENTS: Event[] = [
  { id: "de1", title: "Team standup",           event_date: `${TODAY}T09:00:00Z`, event_type: "meeting"    },
  { id: "de2", title: "Lunch with Sarah",       event_date: `${TODAY}T12:30:00Z`, event_type: "personal"   },
  { id: "de3", title: "Dentist appointment",    event_date: `${TODAY}T15:00:00Z`, event_type: "appointment" },
];

const DEMO_BILLS: Bill[] = [
  { id: "db1", name: "Netflix",   amount: 15.99,  frequency: "monthly", next_due: TODAY },
  { id: "db2", name: "Spotify",   amount: 9.99,   frequency: "monthly", next_due: TODAY },
];

// ── Interfaces ───────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  priority: string;
  due_date: string;
  status: string;
  sort_order?: number;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
}

interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  next_due: string;
}

type Tab = "today" | "calendar" | "lists";

// ── Component ────────────────────────────────────────────────────────────────

export function NavBar() {
  const { openPanel, toggle }           = usePanels();
  const [notifOpen, setNotifOpen]       = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [activeTab, setActiveTab]       = useState<Tab>("today");

  // Today
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [events, setEvents]             = useState<Event[]>([]);
  const [bills, setBills]               = useState<Bill[]>([]);
  const [addingTask, setAddingTask]     = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<PriorityKey>("none");
  const [taskSort, setTaskSort]         = useState<TaskSort>("priority");
  const [sortOpen, setSortOpen]         = useState(false);
  const [addingEvent, setAddingEvent]   = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const taskInputRef                    = useRef<HTMLInputElement>(null);
  const eventInputRef                   = useRef<HTMLInputElement>(null);

  const today      = new Date().toISOString().split("T")[0];
  const totalCount = tasks.length + events.length;

  // ── Debounced reorder saves ──────────────────────────────────────────────

  const taskReorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTaskReorder = useCallback((ids: string[]) => {
    if (taskReorderTimer.current) {
      clearTimeout(taskReorderTimer.current);
    }
    taskReorderTimer.current = setTimeout(() => {
      api.post("/api/tasks/reorder", { ids }).catch(() => {});
    }, 600);
  }, []);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadToday = () => {
    if (isDemo()) {
      setTasks(DEMO_TASKS);
      setEvents(DEMO_EVENTS);
      setBills(DEMO_BILLS);
      return;
    }
    Promise.all([
      api.get<Task[]>("/api/tasks?status=open&sort=manual"),
      api.get<Event[]>("/api/events?upcoming=true&limit=50"),
      api.get<Bill[]>("/api/bills"),
    ]).then(([t, e, b]) => {
      setTasks(t.filter((tk) => tk.due_date === today));
      setEvents(e.filter((ev) => ev.event_date.startsWith(today)));
      setBills(b.filter((bill) => bill.next_due === today));
    }).catch(() => {});
  };

  useEffect(() => {
    if (notifOpen) { loadToday(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  // Auto-refresh Today whenever Orryon touches events, tasks, or bills so
  // a just-scheduled dinner shows up without closing and reopening the
  // quick-access panel.
  useDataRefresh(["today", "schedule", "dashboard", "calendar"], () => {
    if (notifOpen) loadToday();
  });

  // ── Sorted views ─────────────────────────────────────────────────────────

  const sortedTasks = useMemo(() => {
    if (taskSort === "manual") return tasks;
    const arr = [...tasks];
    if (taskSort === "priority") {
      arr.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));
    } else if (taskSort === "date") {
      arr.sort((a, b) => {
        const da = a.due_date || "9999-99-99";
        const db2 = b.due_date || "9999-99-99";
        return da < db2 ? -1 : da > db2 ? 1 : 0;
      });
    } else if (taskSort === "name") {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, taskSort]);

  // ── Task actions ─────────────────────────────────────────────────────────

  const cyclePriority = () => {
    setNewTaskPriority((p) => PRIORITY_CONFIG[p].next);
  };

  const addTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const optimistic: Task = {
      id: `tmp-${Date.now()}`, title, priority: newTaskPriority,
      due_date: today, status: "open",
    };
    setTasks((prev) => [optimistic, ...prev]);
    setNewTaskTitle("");
    setNewTaskPriority("none");
    setAddingTask(false);
    if (isDemo()) return;
    api.post<{ id: string }>("/api/tasks", { title, due_date: today, priority: newTaskPriority })
      .then((res) => setTasks((prev) => prev.map((t) => t.id === optimistic.id ? { ...optimistic, id: res.id } : t)))
      .catch(() => setTasks((prev) => prev.filter((t) => t.id !== optimistic.id)));
  };

  const changeTaskPriority = (task: Task) => {
    const next = PRIORITY_CONFIG[task.priority as PriorityKey]?.next ?? "high";
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, priority: next } : t));
    if (isDemo()) return;
    api.patch(`/api/tasks/${task.id}`, { priority: next }).catch(() => loadToday());
  };

  const completeTask = (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (isDemo()) return;
    api.patch(`/api/tasks/${task.id}`, { status: "done" }).catch(() => loadToday());
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (isDemo()) return;
    api.delete(`/api/tasks/${id}`).catch(() => loadToday());
  };

  const deleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (isDemo()) return;
    api.delete(`/api/events/${id}`).catch(() => loadToday());
  };

  const addEvent = () => {
    const title = newEventTitle.trim();
    if (!title) return;
    const optimistic: Event = {
      id: `tmp-${Date.now()}`, title,
      event_date: today, event_type: "event",
    };
    setEvents((prev) => [...prev, optimistic]);
    setNewEventTitle("");
    setAddingEvent(false);
    if (isDemo()) return;
    api.post<{ id: string }>("/api/events", { title, date: today, event_type: "event" })
      .then((res) => setEvents((prev) => prev.map((e) => e.id === optimistic.id ? { ...optimistic, id: res.id } : e)))
      .catch(() => setEvents((prev) => prev.filter((e) => e.id !== optimistic.id)));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "today",    label: "Today"    },
    { key: "calendar", label: "Calendar" },
    { key: "lists",    label: "Lists"    },
  ];

  const TASK_SORT_OPTIONS: { key: TaskSort; label: string }[] = [
    { key: "priority", label: "Priority" },
    { key: "date",     label: "Date"     },
    { key: "name",     label: "Name"     },
    { key: "manual",   label: "Custom"   },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <Link href="/home" className="text-white font-extrabold tracking-widest uppercase text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center rounded-lg p-2 transition-colors text-white/60 hover:text-white hover:bg-white/5"
          >
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => setNotifOpen((v) => !v)}
            className={cn(
              "relative flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              notifOpen && "text-white bg-white/5",
            )}
          >
            <Bell className="h-5 w-5" strokeWidth={1.5} />
            {totalCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </button>

          <button
            onClick={() => toggle("streaks")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "streaks" && "text-white bg-white/5",
            )}
            aria-label="Streaks"
          >
            <Flame className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => toggle("journal")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "journal" && "text-white bg-white/5",
            )}
            aria-label="Journal"
          >
            <Feather className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => toggle("dashboard")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "dashboard" && "text-white bg-white/5",
            )}
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <InstallButton variant="navbar" />

          <button
            onClick={() => toggle("settings")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "settings" && "text-white bg-white/5",
            )}
          >
            <Settings className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>

      {/* Quick-access panel */}
      <AnimatePresence>
        {notifOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setNotifOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.2 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80 || info.velocity.x > 500) setNotifOpen(false);
              }}
              className="fixed top-0 right-0 h-full z-50 flex flex-col"
              style={{ width: "95vw", maxWidth: 600 }}
            >
              <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                  <h1 className="text-2xl font-extrabold">Quick Access</h1>
                  <button onClick={() => setNotifOpen(false)} className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                  </button>
                </div>

                {/* Breathing widget */}
                <div className="px-5 pt-0 pb-2 shrink-0">
                  <BreathingWidget />
                </div>

                {/* Tab bar */}
                <div className="px-5 pb-3 shrink-0">
                  <div className="flex rounded-full border border-white/5 bg-[#111] p-0.5">
                    {TABS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className="flex-1 rounded-full py-1.5 text-xs font-medium transition-all duration-200"
                        style={{
                          background: activeTab === key ? "rgba(255,255,255,0.1)" : "transparent",
                          color: activeTab === key ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto px-5 pb-4" data-scroll-container>
                 <ErrorBoundary fallback={
                   <div className="flex flex-col items-center justify-center py-12 text-center">
                     <p className="text-white/40 text-sm mb-3">Something went wrong loading this tab.</p>
                     <button onClick={() => window.location.reload()} className="text-xs text-white/30 hover:text-white/60 underline transition">Reload</button>
                   </div>
                 }>

                  {/* ── Today tab ── */}
                  {activeTab === "today" && (
                    <div>

                      {/* Header */}
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-[1.05rem] font-bold text-white/90 leading-tight tracking-tight">Today</p>
                          <p className="text-[0.6rem] text-white/25 mt-0.5">
                            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <button
                            onClick={() => setSortOpen((v) => !v)}
                            className={cn(
                              "flex items-center gap-1 text-[0.65rem] font-medium px-2 py-1 rounded-lg transition",
                              sortOpen
                                ? "bg-white/10 text-white/70"
                                : "text-white/30 hover:text-white/55 hover:bg-white/5",
                            )}
                          >
                            <SlidersHorizontal className="h-3 w-3" strokeWidth={1.5} />
                            View
                          </button>
                          <button
                            onClick={() => { setAddingTask((v) => !v); setTimeout(() => taskInputRef.current?.focus(), 50); }}
                            className="flex items-center justify-center w-6 h-6 rounded-full bg-white hover:bg-gray-200 transition"
                          >
                            {addingTask
                              ? <X className="h-3 w-3 text-black" strokeWidth={1.5} />
                              : <Plus className="h-3 w-3 text-black" strokeWidth={1.5} />
                            }
                          </button>
                        </div>
                      </div>

                      {/* Sort dropdown */}
                      <AnimatePresence>
                        {sortOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-1 flex-wrap pt-1 pb-3">
                              {TASK_SORT_OPTIONS.map(({ key, label }) => (
                                <button
                                  key={key}
                                  onClick={() => { setTaskSort(key); setSortOpen(false); }}
                                  className={cn(
                                    "text-[0.58rem] font-medium px-2 py-0.5 rounded-full border transition",
                                    taskSort === key
                                      ? "bg-white/10 border-white/20 text-white/80"
                                      : "bg-transparent border-white/8 text-white/25 hover:border-white/20 hover:text-white/50",
                                  )}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Item count */}
                      {(tasks.length + events.length + bills.length) > 0 && (
                        <div className="flex items-center gap-1.5 mb-4 mt-1">
                          <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex items-center justify-center shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full border border-white/30" />
                          </div>
                          <p className="text-[0.6rem] text-white/25">
                            {tasks.length + events.length + bills.length} {tasks.length + events.length + bills.length === 1 ? "item" : "items"} today
                          </p>
                        </div>
                      )}

                      {/* Add task form */}
                      {addingTask && (
                        <div className="flex gap-2 mb-4 items-center">
                          <button
                            onClick={cyclePriority}
                            style={{ borderColor: priorityBorderColor(newTaskPriority) }}
                            className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center hover:opacity-70 active:scale-90 transition"
                            title="Cycle priority"
                          />
                          <input
                            ref={taskInputRef}
                            autoFocus
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addTask()}
                            placeholder="New task…"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
                          />
                          <button onClick={addTask} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add</button>
                        </div>
                      )}

                      {/* Add event form */}
                      {addingEvent && (
                        <div className="flex gap-2 mb-4">
                          <input
                            ref={eventInputRef}
                            autoFocus
                            value={newEventTitle}
                            onChange={(e) => setNewEventTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addEvent()}
                            placeholder="Event title…"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
                          />
                          <button onClick={addEvent} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add</button>
                        </div>
                      )}

                      {/* Empty state */}
                      {tasks.length === 0 && events.length === 0 && bills.length === 0 && !addingTask && (
                        <p className="text-white/25 text-sm py-6 text-center">All clear for today.</p>
                      )}

                      {/* ── Events ── */}
                      {events.map((e) => (
                        <SwipeToDelete key={e.id} onDelete={() => deleteEvent(e.id)}>
                          <div className="flex items-center gap-3 py-3 border-b border-white/5 group">
                            <div className="shrink-0 w-5 h-5 rounded-full border border-white/15 flex items-center justify-center">
                              <Calendar className="h-2.5 w-2.5 text-white/25" strokeWidth={1.5} />
                            </div>
                            <p className="text-sm text-white/70 flex-1 leading-snug">{e.title}</p>
                            <span className="text-[0.55rem] uppercase tracking-widest text-white/20 shrink-0">{e.event_type}</span>
                          </div>
                        </SwipeToDelete>
                      ))}

                      {/* ── Tasks (manual / drag) ── */}
                      {taskSort === "manual" ? (
                        <Reorder.Group
                          axis="y"
                          values={tasks}
                          onReorder={(newOrder) => {
                            setTasks(newOrder);
                            saveTaskReorder(newOrder.map((t) => t.id));
                          }}
                          className="space-y-0"
                        >
                          {tasks.map((t) => (
                            <Reorder.Item key={t.id} value={t} className="list-none">
                              <div className="flex items-center gap-2.5 py-3 border-b border-white/5 cursor-grab active:cursor-grabbing">
                                <GripVertical className="h-3.5 w-3.5 text-white/15 shrink-0" strokeWidth={1.5} />
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => completeTask(t)}
                                  style={{ borderColor: priorityBorderColor(t.priority) }}
                                  className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center hover:opacity-70 active:scale-90 transition"
                                />
                                <p className="text-sm text-white/85 flex-1 leading-snug">{t.title}</p>
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => changeTaskPriority(t)}
                                  style={{ color: priorityBorderColor(t.priority) }}
                                  className="shrink-0 text-[0.55rem] font-bold opacity-50 hover:opacity-90 transition w-5 text-center"
                                  title="Change priority"
                                >
                                  {PRIORITY_CONFIG[t.priority as PriorityKey]?.label ?? "P4"}
                                </button>
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => deleteTask(t.id)}
                                  className="shrink-0 w-4 h-4 flex items-center justify-center text-white/15 hover:text-white/50 transition"
                                >
                                  <X className="h-3 w-3" strokeWidth={1.5} />
                                </button>
                              </div>
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      ) : (
                        sortedTasks.map((t) => (
                          <SwipeToDelete key={t.id} onDelete={() => deleteTask(t.id)}>
                            <div className="flex items-center gap-3 py-3 border-b border-white/5">
                              <button
                                onClick={() => completeTask(t)}
                                style={{ borderColor: priorityBorderColor(t.priority) }}
                                className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center hover:opacity-70 active:scale-90 transition"
                              />
                              <p className="text-sm text-white/85 flex-1 leading-snug">{t.title}</p>
                              <button
                                onClick={() => changeTaskPriority(t)}
                                style={{ color: priorityBorderColor(t.priority) }}
                                className="shrink-0 text-[0.55rem] font-bold opacity-40 hover:opacity-80 transition"
                                title="Change priority"
                              >
                                {PRIORITY_CONFIG[t.priority as PriorityKey]?.label ?? "P4"}
                              </button>
                            </div>
                          </SwipeToDelete>
                        ))
                      )}

                      {/* ── Bills due ── */}
                      {bills.map((b) => (
                        <div key={b.id} className="flex items-center gap-3 py-3 border-b border-white/5">
                          <div className="shrink-0 w-5 h-5 rounded-full border border-red-400/30 flex items-center justify-center">
                            <span className="text-red-400/50 text-[0.55rem] font-bold leading-none">$</span>
                          </div>
                          <p className="text-sm text-white/70 flex-1 leading-snug">{b.name}</p>
                          <span className="text-[0.8rem] font-semibold text-red-400/70 shrink-0 tabular-nums">
                            ${Number(b.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}

                      {/* Add event inline action */}
                      <button
                        onClick={() => { setAddingEvent((v) => !v); setTimeout(() => eventInputRef.current?.focus(), 50); }}
                        className="flex items-center gap-2 mt-4 text-[0.65rem] text-white/20 hover:text-white/45 transition"
                      >
                        <Plus className="h-3 w-3" strokeWidth={1.5} />
                        Add event
                      </button>

                    </div>
                  )}

                  {/* ── Calendar tab ── */}
                  {activeTab === "calendar" && <CalendarTab />}

                  {/* ── Lists tab ── */}
                  {activeTab === "lists" && <ListsTab />}

                 </ErrorBoundary>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-white/5 shrink-0">
                  <button
                    onClick={() => { setNotifOpen(false); toggle("dashboard"); }}
                    className="block w-full text-center text-xs text-white/30 hover:text-white/60 transition"
                  >
                    View full dashboard →
                  </button>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
