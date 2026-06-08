"use client";

import { Plus, X, Calendar, GripVertical, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { cn } from "@/lib/utils";
import {
  PRIORITY_CONFIG,
  priorityBorderColor,
  type PriorityKey,
} from "@/components/nav-bar/types";
import { TASK_SORT_OPTIONS, type NavBarToday } from "@/components/nav-bar/use-nav-bar-today";

export function TodayTab({ today }: { today: NavBarToday }) {
  const {
    tasks, setTasks, events, bills,
    addingTask, setAddingTask, newTaskTitle, setNewTaskTitle, newTaskPriority,
    taskSort, setTaskSort, sortOpen, setSortOpen,
    addingEvent, setAddingEvent, newEventTitle, setNewEventTitle,
    taskInputRef, eventInputRef,
    sortedTasks, saveTaskReorder,
    cyclePriority, addTask, changeTaskPriority, completeTask, deleteTask, deleteEvent, addEvent,
  } = today;

  return (
    <div>
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
            className="flex items-center justify-center w-11 h-11 rounded-full bg-white hover:bg-gray-200 transition"
          >
            {addingTask
              ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
              : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
            }
          </button>
        </div>
      </div>

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

      {addingTask && (
        <div className="flex gap-2 mb-4 items-center">
          <button
            onClick={cyclePriority}
            className="shrink-0 w-11 h-11 flex items-center justify-center hover:opacity-70 active:scale-95 transition"
            title="Cycle priority"
          >
            <span style={{ borderColor: priorityBorderColor(newTaskPriority) }} className="w-5 h-5 rounded-full border-2 block" />
          </button>
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

      {tasks.length === 0 && events.length === 0 && bills.length === 0 && !addingTask && (
        <p className="text-white/25 text-sm py-6 text-center">All clear for today.</p>
      )}

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
                  className="shrink-0 w-11 h-11 flex items-center justify-center hover:opacity-70 active:scale-95 transition"
                  title="Complete task"
                >
                  <span
                    style={{ borderColor: priorityBorderColor(t.priority) }}
                    className="w-5 h-5 rounded-full border-2 block"
                  />
                </button>
                <p className="text-sm text-white/85 flex-1 leading-snug">{t.title}</p>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => changeTaskPriority(t)}
                  style={{ color: priorityBorderColor(t.priority) }}
                  className="shrink-0 text-[0.55rem] font-bold opacity-50 hover:opacity-90 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="Change priority"
                >
                  {PRIORITY_CONFIG[t.priority as PriorityKey]?.label ?? "P4"}
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => deleteTask(t.id)}
                  className="shrink-0 w-11 h-11 flex items-center justify-center text-white/15 hover:text-white/50 transition"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
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
                className="shrink-0 w-11 h-11 flex items-center justify-center hover:opacity-70 active:scale-95 transition"
                title="Complete task"
              >
                <span
                  style={{ borderColor: priorityBorderColor(t.priority) }}
                  className="w-5 h-5 rounded-full border-2 block"
                />
              </button>
              <p className="text-sm text-white/85 flex-1 leading-snug">{t.title}</p>
              <button
                onClick={() => changeTaskPriority(t)}
                style={{ color: priorityBorderColor(t.priority) }}
                className="shrink-0 text-[0.55rem] font-bold opacity-40 hover:opacity-80 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Change priority"
              >
                {PRIORITY_CONFIG[t.priority as PriorityKey]?.label ?? "P4"}
              </button>
            </div>
          </SwipeToDelete>
        ))
      )}

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

      <button
        onClick={() => { setAddingEvent((v) => !v); setTimeout(() => eventInputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 mt-4 text-[0.65rem] text-white/20 hover:text-white/45 transition"
      >
        <Plus className="h-3 w-3" strokeWidth={1.5} />
        Add event
      </button>
    </div>
  );
}
