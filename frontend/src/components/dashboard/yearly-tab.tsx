"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

interface MonthSummary {
  month: string;
  label: string;
  total: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

function buildDemoYearly(year: number): { months: MonthSummary[]; topCategories: { category: string; total: number }[] } {
  const totals = [0, 0, 2950, 3100, 2862, 0, 0, 0, 0, 0, 0, 0];
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: new Date(year, i).toLocaleDateString("en-US", { month: "short" }),
    total: totals[i] || 0,
  }));
  return {
    months,
    topCategories: [
      { category: "Rent & Housing", total: 6600 },
      { category: "Food & Dining",  total: 1158 },
      { category: "Groceries",      total:  519 },
      { category: "Transport",      total:  309 },
    ],
  };
}

export function YearlyTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [topCategories, setTopCategories] = useState<{ category: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo()) {
      const demo = buildDemoYearly(year);
      setMonths(demo.months);
      setTopCategories(demo.topCategories);
      setLoading(false);
      return;
    }
    setLoading(true);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    api.get<{ category: string; amount: number; date: string }[]>(
      `/api/transactions?date_from=${from}&date_to=${to}&limit=2000`
    ).then((txns) => {
      // Group by month
      const monthMap: Record<string, number> = {};
      const catMap: Record<string, number> = {};
      for (const t of txns) {
        if (t.amount <= 0) continue;
        const m = t.date.slice(0, 7);
        monthMap[m] = (monthMap[m] || 0) + t.amount;
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
      }

      const monthList: MonthSummary[] = [];
      for (let i = 1; i <= 12; i++) {
        const key = `${year}-${String(i).padStart(2, "0")}`;
        const label = new Date(year, i - 1).toLocaleDateString("en-US", { month: "short" });
        monthList.push({ month: key, label, total: monthMap[key] || 0 });
      }
      setMonths(monthList);

      const cats = Object.entries(catMap)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6);
      setTopCategories(cats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [year]);

  const yearTotal = months.reduce((s, m) => s + m.total, 0);
  const maxMonth = Math.max(...months.map((m) => m.total), 1);

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  return (
    <div>
      {/* Year nav */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setYear((y) => y - 1)}
          className="p-1 text-white/30 hover:text-white transition"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <p className="text-sm font-semibold text-white/85">{year}</p>
        <button
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= currentYear}
          className="p-1 text-white/30 hover:text-white disabled:opacity-20 transition"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Year total */}
      <div className="text-center mb-6">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/25">Total Spent {year}</p>
        <p className="text-3xl font-bold text-white/85 mt-0.5">{fmt(yearTotal)}</p>
        {yearTotal > 0 && (
          <p className="text-xs text-white/30 mt-1">{fmt(yearTotal / 12)} avg / month</p>
        )}
      </div>

      {/* Monthly bar chart */}
      {yearTotal > 0 && (
        <div className="mb-6">
          <p className="text-[0.65rem] uppercase tracking-wide text-white/25 mb-3">Monthly Breakdown</p>
          <div className="flex items-end gap-1.5 h-24">
            {months.map((m) => {
              const heightPct = maxMonth > 0 ? (m.total / maxMonth) * 100 : 0;
              const isCurrentMonth = m.month === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                    <div
                      className={`w-full rounded-t-sm transition-all ${isCurrentMonth ? "bg-blue-400" : "bg-white/20"}`}
                      style={{ height: `${Math.max(heightPct, m.total > 0 ? 4 : 1)}%` }}
                      title={`${m.label}: ${fmt(m.total)}`}
                    />
                  </div>
                  <span className="text-[0.5rem] text-white/25">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top categories */}
      {topCategories.length > 0 && (
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/25 mb-2">Top Categories</p>
          {topCategories.map((c) => (
            <div key={c.category} className="flex items-center justify-between py-2.5 border-b border-white/5">
              <span className="text-sm text-white/80">{c.category}</span>
              <div className="text-right">
                <p className="text-sm font-semibold text-white/85">{fmt(c.total)}</p>
                {yearTotal > 0 && (
                  <p className="text-[0.6rem] text-white/25">{Math.round((c.total / yearTotal) * 100)}% of year</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {yearTotal === 0 && (
        <p className="text-white/30 text-sm text-center py-10">No spending data for {year}.</p>
      )}
    </div>
  );
}
