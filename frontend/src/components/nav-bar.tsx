"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Settings, LayoutGrid, Bell, X, Search, Plus, Calendar } from "lucide-react";
import { BreathingWidget } from "@/components/dashboard/breathing-widget";
import { NotesTab } from "@/components/dashboard/notes-tab";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { SearchPanel } from "@/components/search-panel";
import { usePanels } from "@/lib/panel-context";

interface Task {
  id: string;
  title: string;
  priority: string;
  due_date: string;
  status: string;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  is_checked: number;
  added_at: string;
}

interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  next_due: string;
}

type Tab = "today" | "lists" | "journal";

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
  const [addingEvent, setAddingEvent]   = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const taskInputRef                    = useRef<HTMLInputElement>(null);
  const eventInputRef                   = useRef<HTMLInputElement>(null);

  // Lists
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [addingItem, setAddingItem]     = useState(false);
  const [newItemName, setNewItemName]   = useState("");
  const groceryInputRef                 = useRef<HTMLInputElement>(null);

  const today      = new Date().toISOString().split("T")[0];
  const totalCount = tasks.length + events.length;

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadToday = () => {
    Promise.all([
      api.get<Task[]>("/api/tasks?status=open"),
      api.get<Event[]>("/api/events?upcoming=true&limit=50"),
      api.get<Bill[]>("/api/bills"),
    ]).then(([t, e, b]) => {
      setTasks(t.filter((tk) => tk.due_date === today));
      setEvents(e.filter((ev) => ev.event_date.startsWith(today)));
      setBills(b.filter((bill) => bill.next_due === today));
    }).catch(() => {});
  };

  const loadGrocery = () => {
    api.get<GroceryItem[]>("/api/grocery").then(setGroceryItems).catch(() => {});
  };

  useEffect(() => {
    if (notifOpen) { loadToday(); loadGrocery(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  // ── Task actions ─────────────────────────────────────────────────────────────

  const addTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const optimistic: Task = {
      id: `tmp-${Date.now()}`, title, priority: "medium",
      due_date: today, status: "open",
    };
    setTasks((prev) => [optimistic, ...prev]);
    setNewTaskTitle("");
    setAddingTask(false);
    api.post<{ id: string }>("/api/tasks", { title, due_date: today, priority: "medium" })
      .then((res) => setTasks((prev) => prev.map((t) => t.id === optimistic.id ? { ...optimistic, id: res.id } : t)))
      .catch(() => setTasks((prev) => prev.filter((t) => t.id !== optimistic.id)));
  };

  const completeTask = (task: Task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    api.patch(`/api/tasks/${task.id}`, { status: "done" }).catch(() => loadToday());
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    api.delete(`/api/tasks/${id}`).catch(() => loadToday());
  };

  const deleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
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
    api.post<{ id: string }>("/api/events", { title, date: today, event_type: "event" })
      .then((res) => setEvents((prev) => prev.map((e) => e.id === optimistic.id ? { ...optimistic, id: res.id } : e)))
      .catch(() => setEvents((prev) => prev.filter((e) => e.id !== optimistic.id)));
  };

  // ── Grocery actions ──────────────────────────────────────────────────────────

  const addGroceryItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    const optimistic: GroceryItem = {
      id: `tmp-${Date.now()}`, name, quantity: "",
      is_checked: 0, added_at: new Date().toISOString(),
    };
    setGroceryItems((prev) => [optimistic, ...prev]);
    setNewItemName("");
    setAddingItem(false);
    api.post<{ id: string }>("/api/grocery", { name })
      .then((res) => setGroceryItems((prev) => prev.map((i) => i.id === optimistic.id ? { ...optimistic, id: res.id } : i)))
      .catch(() => setGroceryItems((prev) => prev.filter((i) => i.id !== optimistic.id)));
  };

  const toggleGrocery = (item: GroceryItem) => {
    setGroceryItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_checked: i.is_checked ? 0 : 1 } : i));
    api.patch(`/api/grocery/${item.id}`, {}).catch(() => loadGrocery());
  };

  const deleteGrocery = (id: string) => {
    setGroceryItems((prev) => prev.filter((i) => i.id !== id));
    api.delete(`/api/grocery/${id}`).catch(() => loadGrocery());
  };

  const unchecked = groceryItems.filter((i) => !i.is_checked);
  const checked   = groceryItems.filter((i) => i.is_checked);

  const TABS: { key: Tab; label: string }[] = [
    { key: "today",   label: "Today"   },
    { key: "lists",   label: "Lists"   },
    { key: "journal", label: "Journal" },
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
            onClick={() => toggle("dashboard")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "dashboard" && "text-white bg-white/5",
            )}
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.5} />
          </button>

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
              dragElastic={{ left: 0.2, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -80 || info.velocity.x < -500) setNotifOpen(false);
              }}
              className="fixed top-0 right-0 h-full z-50 flex flex-col"
              style={{ width: "95vw", maxWidth: 600 }}
            >
              <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                  <p className="text-sm font-semibold text-white/85">Quick Access</p>
                  <button onClick={() => setNotifOpen(false)} className="text-white/40 hover:text-white transition">
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>

                {/* Breathing widget — always pinned */}
                <div className="px-5 pt-4 pb-2 shrink-0">
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
                <div className="flex-1 overflow-y-auto px-5 pb-4">

                  {/* ── Today tab ── */}
                  {activeTab === "today" && (
                    <div>
                      <p className="text-[0.6rem] uppercase tracking-wide text-white/20 mb-5">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </p>

                      {/* Events */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
                            <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Events</p>
                          </div>
                          <button
                            onClick={() => { setAddingEvent((v) => !v); setTimeout(() => eventInputRef.current?.focus(), 50); }}
                            className="flex items-center justify-center w-6 h-6 rounded-full bg-white hover:bg-gray-200 transition"
                          >
                            {addingEvent
                              ? <X className="h-3 w-3 text-black" strokeWidth={1.5} />
                              : <Plus className="h-3 w-3 text-black" strokeWidth={1.5} />
                            }
                          </button>
                        </div>

                        {addingEvent && (
                          <div className="flex gap-2 mb-3">
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

                        {events.length === 0 && !addingEvent && (
                          <p className="text-white/25 text-sm py-2">Nothing scheduled today.</p>
                        )}

                        {events.map((e) => (
                          <SwipeToDelete key={e.id} onDelete={() => deleteEvent(e.id)}>
                            <div className="py-2.5 border-b border-white/5">
                              <p className="text-sm text-white/80">{e.title}</p>
                              <p className="text-[0.65rem] text-white/30 mt-0.5 capitalize">{e.event_type}</p>
                            </div>
                          </SwipeToDelete>
                        ))}
                      </div>

                      {/* Tasks */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Tasks</p>
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

                        {addingTask && (
                          <div className="flex gap-2 mb-3">
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

                        {tasks.length === 0 && !addingTask && (
                          <p className="text-white/25 text-sm py-2">No tasks due today.</p>
                        )}

                        {tasks.map((t) => (
                          <SwipeToDelete key={t.id} onDelete={() => deleteTask(t.id)}>
                            <div className="flex items-center gap-3 py-2.5 border-b border-white/5">
                              <button
                                onClick={() => completeTask(t)}
                                className="shrink-0 w-5 h-5 rounded-full border border-white/25 flex items-center justify-center transition hover:border-white/60 active:scale-90"
                              />
                              <p className="text-sm text-white/85 flex-1 leading-snug">{t.title}</p>
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                t.priority === "high" ? "bg-red-400" : t.priority === "medium" ? "bg-yellow-400" : "bg-green-400"
                              )} />
                            </div>
                          </SwipeToDelete>
                        ))}
                      </div>

                      {/* Bills due today — only shown if any */}
                      {bills.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-3">
                            <p className="text-[0.65rem] uppercase tracking-wide text-white/30">💳 Bills Due</p>
                          </div>
                          {bills.map((b) => (
                            <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-white/5">
                              <p className="text-sm text-white/80">{b.name}</p>
                              <span className="text-sm font-semibold text-red-400/80">
                                ${Number(b.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Lists tab ── */}
                  {activeTab === "lists" && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Grocery</p>
                        <button
                          onClick={() => { setAddingItem((v) => !v); setTimeout(() => groceryInputRef.current?.focus(), 50); }}
                          className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition"
                        >
                          {addingItem
                            ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
                            : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
                          }
                        </button>
                      </div>

                      {addingItem && (
                        <div className="flex gap-2 mb-4">
                          <input
                            ref={groceryInputRef}
                            autoFocus
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addGroceryItem()}
                            placeholder="Add item…"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
                          />
                          <button onClick={addGroceryItem} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add</button>
                        </div>
                      )}

                      {groceryItems.length === 0 && !addingItem && (
                        <p className="text-white/30 text-sm text-center py-8">
                          Your list is empty — tap + or tell Orryon to add something.
                        </p>
                      )}

                      {unchecked.map((item) => (
                        <SwipeToDelete key={item.id} onDelete={() => deleteGrocery(item.id)}>
                          <div className="flex items-center gap-3 py-3 border-b border-white/5">
                            <button
                              onClick={() => toggleGrocery(item)}
                              className="shrink-0 w-5 h-5 rounded-full border border-white/25 flex items-center justify-center transition hover:border-white/60 active:scale-90"
                            />
                            <p className="text-sm text-white/85 flex-1">{item.name}</p>
                          </div>
                        </SwipeToDelete>
                      ))}

                      {checked.length > 0 && (
                        <div className="mt-5">
                          <p className="text-[0.6rem] uppercase tracking-widest text-white/15 mb-1">Done</p>
                          {checked.map((item) => (
                            <SwipeToDelete key={item.id} onDelete={() => deleteGrocery(item.id)}>
                              <div className="flex items-center gap-3 py-3 border-b border-white/5">
                                <button
                                  onClick={() => toggleGrocery(item)}
                                  className="shrink-0 w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center transition active:scale-90"
                                >
                                  <span className="text-white/40 text-[0.55rem] leading-none">✓</span>
                                </button>
                                <p className="text-sm text-white/30 flex-1 line-through">{item.name}</p>
                              </div>
                            </SwipeToDelete>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Journal tab ── */}
                  {activeTab === "journal" && (
                    <NotesTab />
                  )}

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
