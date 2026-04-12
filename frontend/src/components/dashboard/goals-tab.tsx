"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { SwipeToDelete } from "@/components/swipe-to-delete";


interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  category: string;
  notes: string;
  is_completed: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function daysLeft(target: string): string {
  if (!target) return "";
  const diff = Math.ceil((new Date(target).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return "past deadline";
  if (diff === 1) return "1 day left";
  return `${diff}d left`;
}

function barColor(pct: number): string {
  if (pct >= 75) return "bg-green-400";
  if (pct >= 40) return "bg-green-500/70";
  return "bg-green-600/50";
}

export function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    api.get<Goal[]>("/api/goals?include_completed=true")
      .then(setGoals).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const addGoal = () => {
    if (!name.trim() || !target) return;
    const optimistic: Goal = {
      id: Date.now().toString(),
      name: name.trim(),
      target_amount: parseFloat(target),
      current_amount: 0,
      target_date: "",
      category: "other",
      notes: "",
      is_completed: 0,
    };
    api.post("/api/goals", { name: name.trim(), target_amount: parseFloat(target) }).then(() => {
      setGoals((prev) => [optimistic, ...prev]);
      setName("");
      setTarget("");
      setAdding(false);
    }).catch(() => {});
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  const active = goals.filter((g) => !g.is_completed);
  const completed = goals.filter((g) => g.is_completed);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Goals</p>
        <button onClick={() => setAdding((v) => !v)} className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition">
          {adding ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} /> : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />}
        </button>
      </div>

      {adding && (
        <div className="flex flex-col gap-2 mb-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name (e.g. Save for vacation)"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            type="number"
            placeholder="Target amount ($)"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <button onClick={addGoal} className="py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add Goal</button>
        </div>
      )}

      {active.length === 0 && completed.length === 0 && !adding && (
        <p className="text-white/30 text-sm text-center py-8">No goals yet. Tap + to add one.</p>
      )}

      {active.map((g) => {
        const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
        const remaining = Math.max(0, g.target_amount - g.current_amount);
        return (
          <SwipeToDelete key={g.id} onDelete={() => api.delete(`/api/goals/${g.id}`).then(() => setGoals((prev) => prev.filter((x) => x.id !== g.id))).catch(() => {})}>
            <Card className="bg-white/[0.03] border-white/[0.06] mb-3">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{g.name}</span>
                  <span className="text-sm font-bold text-green-400">{Math.round(pct)}%</span>
                </div>
                <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                  <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[0.7rem] text-white/30">
                  <span>{fmt(g.current_amount)} saved of {fmt(g.target_amount)}</span>
                  <span>{fmt(remaining)} to go{g.target_date ? ` · ${daysLeft(g.target_date)}` : ""}</span>
                </div>
                {g.notes && <p className="text-[0.65rem] text-white/15 mt-1">{g.notes}</p>}
              </CardContent>
            </Card>
          </SwipeToDelete>
        );
      })}

      {completed.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Completed</p>
          {completed.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2 border-b border-white/5 text-sm text-white/40">
              <span>✓ {g.name}</span>
              <span>{fmt(g.target_amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
