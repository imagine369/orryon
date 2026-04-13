"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { isDemo, DEMO_TRANSACTIONS, DEMO_TOP_CATS, DEMO_TASKS_OV } from "./demo-data";

interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  due_date: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

function priorityColor(p: string) {
  if (p === "high") return "bg-red-400";
  if (p === "medium") return "bg-yellow-400";
  return "bg-green-400";
}

export function OverviewTab() {
  const [selectedMonth, setSelectedMonth] = useState(nowMonth);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [topCategories, setTopCategories] = useState<{ category: string; total: number }[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const isCurrentMonth = selectedMonth === nowMonth();

  useEffect(() => {
    if (isDemo()) {
      setTransactions(DEMO_TRANSACTIONS);
      setTopCategories(DEMO_TOP_CATS);
      setTasks(DEMO_TASKS_OV);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [year, month] = selectedMonth.split("-");
    const from = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

    const fetches: Promise<unknown>[] = [
      api.get<Transaction[]>(`/api/transactions?date_from=${from}&date_to=${to}&limit=500`).then((txns) => {
        const positive = txns.filter((t) => t.amount > 0);
        setTransactions(positive.slice(0, 10));

        const catMap: Record<string, number> = {};
        for (const t of positive) {
          catMap[t.category] = (catMap[t.category] || 0) + t.amount;
        }
        const cats = Object.entries(catMap)
          .map(([category, total]) => ({ category, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);
        setTopCategories(cats);
      }),
    ];

    if (isCurrentMonth) {
      fetches.push(
        api.get<Task[]>("/api/tasks?status=open").then(setTasks)
      );
    } else {
      setTasks([]);
    }

    Promise.all(fetches).catch(() => {}).finally(() => setLoading(false));
  }, [selectedMonth, isCurrentMonth]);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setSelectedMonth((m) => offsetMonth(m, -1))}
          className="p-1 text-white/30 hover:text-white transition"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <p className="text-sm font-semibold text-white/85">{formatMonthLabel(selectedMonth)} Overview</p>
        <button
          onClick={() => setSelectedMonth((m) => offsetMonth(m, 1))}
          disabled={isCurrentMonth}
          className="p-1 text-white/30 hover:text-white disabled:opacity-20 transition"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <>
          {topCategories.length > 0 && (
            <div className="mb-5">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/25 mb-2">Top Categories</p>
              {topCategories.map((c) => (
                <div key={c.category} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                  <span className="text-white/80">{c.category}</span>
                  <span className="font-semibold text-white/85">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}

          {transactions.length > 0 && (
            <div className="mb-5">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/25 mb-2">Transactions</p>
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-white/85 truncate">{t.merchant}</p>
                    <p className="text-[0.7rem] text-white/25">{t.category} · {t.date}</p>
                  </div>
                  <span className="font-semibold text-white/85 ml-3">-{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {tasks.length > 0 && (
            <div>
              <p className="text-[0.65rem] uppercase tracking-wide text-white/25 mb-2">Open Tasks</p>
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2 border-b border-white/5 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor(t.priority)}`} />
                  <span className="text-white/80 flex-1">{t.title}</span>
                  {t.due_date && <span className="text-white/25 text-xs">{t.due_date}</span>}
                </div>
              ))}
            </div>
          )}

          {topCategories.length === 0 && transactions.length === 0 && tasks.length === 0 && (
            <p className="text-white/30 text-sm text-center py-10">No data for {formatMonthLabel(selectedMonth)}.</p>
          )}
        </>
      )}
    </div>
  );
}
