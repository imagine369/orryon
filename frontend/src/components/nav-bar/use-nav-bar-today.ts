"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useDataRefresh } from "@/lib/use-data-refresh";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  isDemo,
  DEMO_TASKS,
  DEMO_EVENTS,
  DEMO_BILLS,
  type PriorityKey,
  type TaskSort,
  type Task,
  type Event,
  type Bill,
} from "@/components/nav-bar/types";

export const TASK_SORT_OPTIONS: { key: TaskSort; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "date",     label: "Date"     },
  { key: "name",     label: "Name"     },
  { key: "manual",   label: "Custom"   },
];

export function useNavBarToday(notifOpen: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<PriorityKey>("none");
  const [taskSort, setTaskSort] = useState<TaskSort>("priority");
  const [sortOpen, setSortOpen] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const taskInputRef = useRef<HTMLInputElement>(null);
  const eventInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const totalCount = tasks.length + events.length;

  const taskReorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTaskReorder = useCallback((ids: string[]) => {
    if (taskReorderTimer.current) {
      clearTimeout(taskReorderTimer.current);
    }
    taskReorderTimer.current = setTimeout(() => {
      api.post("/api/tasks/reorder", { ids }).catch(() => {});
    }, 600);
  }, []);

  const loadToday = useCallback(() => {
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
  }, [today]);

  useQueuedEffect(() => {
    if (notifOpen) loadToday();
  }, [notifOpen, loadToday]);

  useDataRefresh(["today", "schedule", "dashboard", "calendar"], loadToday);

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
  }, [tasks, taskSort]);

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

  return {
    tasks,
    setTasks,
    events,
    bills,
    addingTask,
    setAddingTask,
    newTaskTitle,
    setNewTaskTitle,
    newTaskPriority,
    taskSort,
    setTaskSort,
    sortOpen,
    setSortOpen,
    addingEvent,
    setAddingEvent,
    newEventTitle,
    setNewEventTitle,
    taskInputRef,
    eventInputRef,
    totalCount,
    sortedTasks,
    saveTaskReorder,
    cyclePriority,
    addTask,
    changeTaskPriority,
    completeTask,
    deleteTask,
    deleteEvent,
    addEvent,
  };
}

export type NavBarToday = ReturnType<typeof useNavBarToday>;
