"use client";

import { useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { ReceiptScanner } from "@/components/dashboard/receipt-scanner";
import { isDemo, DEMO_BUDGET } from "./demo-data";
import { useDataRefresh } from "@/lib/use-data-refresh";

interface BudgetCategory {
  id: string;
  category: string;
  planned: number;
  spent: number;
  remaining: number;
  pct_used: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function barColor(pct: number) {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-yellow-500";
  return "bg-green-500";
}

function nowMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function offsetMonth(base: string, delta: number): string {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(m: string) {
  const [year, month] = m.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const categories = [
  "Food & Dining", "Groceries", "Transport", "Entertainment",
  "Shopping", "Health & Fitness", "Utilities", "Rent & Housing",
  "Travel", "Subscriptions", "Personal Care", "Education", "Other",
];

export function BudgetTab() {
  const [selectedMonth, setSelectedMonth] = useState(nowMonth);
  const [data, setData] = useState<{ month: string; categories: BudgetCategory[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & Dining");

  const isCurrentMonth = selectedMonth === nowMonth();

  const load = () => {
    if (isDemo()) { setData(DEMO_BUDGET); return; }
    api.get<{ month: string; categories: BudgetCategory[] }>(`/api/budget?month=${selectedMonth}`).then(setData).catch(() => {});
  };

  useQueuedEffect(load, [selectedMonth]);
  useDataRefresh(["budget", "dashboard"], load);

  const addExpense = () => {
    if (!merchant.trim() || !amount) return;
    api.post("/api/transactions", { amount: parseFloat(amount), merchant: merchant.trim(), category }).then(() => {
      setMerchant("");
      setAmount("");
      setAdding(false);
      load();
    }).catch(() => {});
  };

  if (!data) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  const totalPlanned = data.categories.reduce((s, c) => s + c.planned, 0);
  const totalSpent = data.categories.reduce((s, c) => s + c.spent, 0);

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setSelectedMonth((m) => offsetMonth(m, -1))}
          className="p-1 text-white/30 hover:text-white transition"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <p className="text-sm font-semibold text-white/85">{formatMonthLabel(selectedMonth)}</p>
        <button
          onClick={() => setSelectedMonth((m) => offsetMonth(m, 1))}
          disabled={isCurrentMonth}
          className="p-1 text-white/30 hover:text-white disabled:opacity-20 transition"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Budget</p>
          <p className="text-lg font-bold text-white/85">{fmt(totalPlanned)} <span className="text-sm font-normal text-white/30">/ {fmt(totalSpent)} spent</span></p>
        </div>
        <div className="flex items-center gap-2">
          {isCurrentMonth && <ReceiptScanner onSaved={load} />}
          {isCurrentMonth && (
            <button onClick={() => setAdding((v) => !v)} className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition">
              {adding ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} /> : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />}
            </button>
          )}
        </div>
      </div>

      {adding && isCurrentMonth && (
        <div className="flex flex-col gap-2 mb-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <input
            autoFocus
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Merchant"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="Amount"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={addExpense} className="py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">Add Expense</button>
        </div>
      )}

      {data.categories.length === 0 && !adding ? (
        <p className="text-white/30 text-sm text-center py-8">No budgets set yet. Ask orryon to set one!</p>
      ) : (
        data.categories.map((c) => (
          <SwipeToDelete
            key={c.id}
            onDelete={() =>
              api.delete(`/api/budget/${c.id}`).then(() =>
                setData((prev) =>
                  prev ? { ...prev, categories: prev.categories.filter((x) => x.id !== c.id) } : prev
                )
              ).catch(() => {})
            }
          >
            <div className="py-3 border-b border-white/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[16px] font-semibold">{c.category}</span>
                <span className="text-sm text-white/50">{fmt(c.spent)} / {fmt(c.planned)}</span>
              </div>
              <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor(c.pct_used)}`}
                  style={{ width: `${Math.min(100, c.pct_used)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[0.65rem] text-white/25">{Math.round(c.pct_used)}% used</span>
                <span className="text-[0.65rem] text-white/25">{fmt(Math.max(0, c.remaining))} left</span>
              </div>
            </div>
          </SwipeToDelete>
        ))
      )}
    </div>
  );
}
