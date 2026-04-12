"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LayoutGrid, Bell, X, CheckSquare, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

interface Task {
  id: string;
  title: string;
  priority: string;
  due_date: string;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
}

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const today = new Date().toISOString().split("T")[0];
  const totalCount = tasks.length + events.length;

  useEffect(() => {
    const load = () => {
      Promise.all([
        api.get<Task[]>("/api/tasks?status=open"),
        api.get<Event[]>("/api/events?upcoming=true&limit=50"),
      ]).then(([t, e]) => {
        setTasks(t.filter((tk) => tk.due_date === today));
        setEvents(e.filter((ev) => ev.event_date.startsWith(today)));
      }).catch(() => {});
    };
    load();
  }, [today]);

  return (
    <>
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <Link href="/home" className="text-white font-extrabold tracking-widest uppercase text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </Link>
        <div className="flex items-center gap-1">
          {/* Notification bell */}
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "relative flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              open && "text-white bg-white/5",
            )}
          >
            <Bell className="h-5 w-5" strokeWidth={1.5} />
            {totalCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </button>

          <Link
            href="/dashboard"
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              pathname.startsWith("/dashboard") && "text-white bg-white/5",
            )}
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.5} />
          </Link>
          <Link
            href="/settings"
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              pathname === "/settings" && "text-white bg-white/5",
            )}
          >
            <Settings className="h-5 w-5" strokeWidth={1.5} />
          </Link>
        </div>
      </nav>

      {/* Notification panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed top-0 right-0 h-full w-80 max-w-[90vw] z-50 bg-[#0a0a0a] border-l border-white/5 flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <p className="text-sm font-semibold text-white">Today</p>
                <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white transition">
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-[0.6rem] uppercase tracking-wide text-white/20 mb-4">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>

                {totalCount === 0 && (
                  <p className="text-white/30 text-sm text-center mt-12">Nothing due today. You're all clear.</p>
                )}

                {tasks.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-1.5 mb-3">
                      <CheckSquare className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
                      <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Tasks Due</p>
                    </div>
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-start gap-2.5 py-2.5 border-b border-white/5">
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                          t.priority === "high" ? "bg-red-400" : t.priority === "medium" ? "bg-yellow-400" : "bg-green-400"
                        )} />
                        <p className="text-sm text-white/80 leading-snug">{t.title}</p>
                      </div>
                    ))}
                  </div>
                )}

                {events.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <Calendar className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
                      <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Events Today</p>
                    </div>
                    {events.map((e) => (
                      <div key={e.id} className="py-2.5 border-b border-white/5">
                        <p className="text-sm text-white/80">{e.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-white/5">
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="block text-center text-xs text-white/30 hover:text-white/60 transition"
                >
                  View full dashboard →
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
