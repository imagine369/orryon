"use client";

import { useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { isDemo, DEMO_BILLS } from "./demo-data";
import { useDataRefresh } from "@/lib/use-data-refresh";

interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  next_due: string;
  category: string;
  is_active: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function daysUntil(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

function daysUntilColor(dateStr: string): string {
  if (!dateStr) return "text-white/25";
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "text-red-400";
  if (diff <= 3) return "text-yellow-400";
  return "text-white/30";
}

function freqLabel(f: string): string {
  if (f === "monthly") return "Monthly";
  if (f === "weekly") return "Weekly";
  if (f === "yearly") return "Yearly";
  if (f === "quarterly") return "Quarterly";
  return f;
}

const FREQUENCIES = ["monthly", "weekly", "yearly", "quarterly"];

export function BillsTab() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDue, setNextDue] = useState("");

  const load = () => {
    if (isDemo()) { setBills(DEMO_BILLS); setLoading(false); return; }
    api.get<Bill[]>("/api/bills").then(setBills).catch(() => {}).finally(() => setLoading(false));
  };

  useQueuedEffect(load, []);
  useDataRefresh(["schedule", "forecast", "dashboard"], load);

  const addBill = () => {
    if (!name.trim() || !amount) return;
    api.post("/api/bills", {
      name: name.trim(),
      amount: parseFloat(amount),
      frequency,
      next_due: nextDue || undefined,
    }).then(() => {
      setName(""); setAmount(""); setFrequency("monthly"); setNextDue("");
      setAdding(false);
      load();
    }).catch(() => {});
  };

  const totalMonthly = bills.reduce((sum, b) => {
    if (b.frequency === "monthly") return sum + b.amount;
    if (b.frequency === "weekly") return sum + b.amount * 4.33;
    if (b.frequency === "yearly") return sum + b.amount / 12;
    if (b.frequency === "quarterly") return sum + b.amount / 3;
    return sum + b.amount;
  }, 0);

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/25">Recurring Bills</p>
          {bills.length > 0 && (
            <p className="text-lg font-bold text-white/85 mt-0.5">
              {fmt(totalMonthly)} <span className="text-sm font-normal text-white/30">/ month</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition"
        >
          {adding
            ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
            : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
          }
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="flex flex-col gap-2 mb-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bill name (e.g. Netflix, Rent)"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="Amount ($)"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <div className="flex gap-2">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
            >
              {FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
            </select>
            <input
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
              type="date"
              placeholder="Next due"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <button onClick={addBill} className="py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">
            Add Bill
          </button>
        </div>
      )}

      {bills.length === 0 && !adding && (
        <p className="text-white/30 text-sm text-center py-8">No recurring bills yet. Tap + to add one.</p>
      )}

      {/* Bills list */}
      <div>
        {bills.map((b) => (
          <SwipeToDelete
            key={b.id}
            onDelete={() => api.delete(`/api/bills/${b.id}`).then(() => setBills((prev) => prev.filter((x) => x.id !== b.id))).catch(() => {})}
          >
            <div className="flex items-center gap-3 py-3 border-b border-white/5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white/85 truncate">{b.name}</p>
                  <p className="text-sm font-semibold text-white/85 ml-3">{fmt(b.amount)}</p>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[0.65rem] text-white/30">{freqLabel(b.frequency)}</p>
                  <p className={`text-[0.65rem] ${daysUntilColor(b.next_due)}`}>
                    {daysUntil(b.next_due)}
                  </p>
                </div>
              </div>
            </div>
          </SwipeToDelete>
        ))}
      </div>
    </div>
  );
}
