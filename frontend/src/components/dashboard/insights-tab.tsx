"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "@/lib/api";

interface CategorySpend {
  category: string;
  total: number;
}

interface MonthData {
  month: string;
  categories: CategorySpend[];
  total: number;
}

const COLORS = [
  "#60a5fa", // blue-400 — trust, primary
  "#2dd4bf", // teal-400 — stability
  "#c084fc", // purple-400 — premium
  "#fbbf24", // amber-400 — warmth
  "#818cf8", // indigo-400 — depth
  "#86efac", // green-300 — growth
  "#f9a8d4", // pink-300 — contrast
  "#67e8f9", // cyan-300 — clarity
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function formatMonthLabel(m: string) {
  const [year, month] = m.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function trendIcon(current: number, previous: number) {
  if (!previous) return <Minus className="h-3 w-3 text-white/30" strokeWidth={1.5} />;
  const pct = ((current - previous) / previous) * 100;
  if (pct > 5) return <TrendingUp className="h-3 w-3 text-red-400" strokeWidth={1.5} />;
  if (pct < -5) return <TrendingDown className="h-3 w-3 text-green-400" strokeWidth={1.5} />;
  return <Minus className="h-3 w-3 text-white/30" strokeWidth={1.5} />;
}

function trendLabel(current: number, previous: number): string {
  if (!previous) return "";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return "—";
}

function trendColor(current: number, previous: number): string {
  if (!previous) return "text-white/25";
  const pct = ((current - previous) / previous) * 100;
  if (pct > 5) return "text-red-400";
  if (pct < -5) return "text-green-400";
  return "text-white/25";
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs">
        <p className="text-white font-semibold">{payload[0].name}</p>
        <p className="text-white/60">{fmt(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export function InsightsTab() {
  const months = getMonths(3);
  const [monthIndex, setMonthIndex] = useState(months.length - 1);
  const [data, setData] = useState<Record<string, MonthData>>({});
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const results: Record<string, MonthData> = {};
      await Promise.all(
        months.map(async (m) => {
          const [year, month] = m.split("-");
          const from = `${year}-${month}-01`;
          const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
          const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
          const txns = await api.get<{ category: string; amount: number }[]>(
            `/api/transactions?date_from=${from}&date_to=${to}&limit=500`
          );
          const map: Record<string, number> = {};
          for (const t of txns) {
            if (t.amount > 0) map[t.category] = (map[t.category] || 0) + t.amount;
          }
          const categories = Object.entries(map)
            .map(([category, total]) => ({ category, total }))
            .sort((a, b) => b.total - a.total);
          const total = categories.reduce((s, c) => s + c.total, 0);
          results[m] = { month: m, categories, total };
        })
      );
      setData(results);
      setLoading(false);
    };
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMonth = months[monthIndex];
  const prevMonth = months[monthIndex - 1];
  const current = data[currentMonth];
  const previous = data[prevMonth];

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  if (!current || current.total === 0) {
    return (
      <div>
        <MonthNav months={months} monthIndex={monthIndex} setMonthIndex={setMonthIndex} />
        <p className="text-white/30 text-sm text-center py-10">No spending data for this month.</p>
      </div>
    );
  }

  const pieData = current.categories.slice(0, 8).map((c) => ({
    name: c.category,
    value: c.total,
  }));

  return (
    <div>
      <MonthNav months={months} monthIndex={monthIndex} setMonthIndex={setMonthIndex} />

      {/* Total */}
      <div className="text-center mb-2">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/25">Total Spent</p>
        <p className="text-3xl font-bold text-white mt-0.5">{fmt(current.total)}</p>
        {previous && (
          <p className={`text-xs mt-1 ${trendColor(current.total, previous.total)}`}>
            {trendLabel(current.total, previous.total)} vs last month
          </p>
        )}
      </div>

      {/* Pie chart */}
      <div className="h-52 w-full my-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {pieData.map((_, index) => (
                <Cell
                  key={index}
                  fill={COLORS[index % COLORS.length]}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.4}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category list */}
      <div className="space-y-0">
        {current.categories.map((c, i) => {
          const prevCat = previous?.categories.find((p) => p.category === c.category);
          const pct = current.total > 0 ? ((c.total / current.total) * 100).toFixed(0) : "0";
          return (
            <div key={c.category} className="flex items-center gap-3 py-2.5 border-b border-white/5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white truncate">{c.category}</p>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {prevCat && trendIcon(c.total, prevCat.total)}
                    <span className={`text-xs ${trendColor(c.total, prevCat?.total || 0)}`}>
                      {prevCat ? trendLabel(c.total, prevCat.total) : ""}
                    </span>
                    <span className="text-sm font-semibold text-white">{fmt(c.total)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-[0.6rem] text-white/25 w-7 text-right">{pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthNav({ months, monthIndex, setMonthIndex }: { months: string[]; monthIndex: number; setMonthIndex: (i: number) => void }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <button
        onClick={() => setMonthIndex(Math.max(0, monthIndex - 1))}
        disabled={monthIndex === 0}
        className="p-1 text-white/30 hover:text-white disabled:opacity-20 transition"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <p className="text-sm font-semibold text-white">{formatMonthLabel(months[monthIndex])}</p>
      <button
        onClick={() => setMonthIndex(Math.min(months.length - 1, monthIndex + 1))}
        disabled={monthIndex === months.length - 1}
        className="p-1 text-white/30 hover:text-white disabled:opacity-20 transition"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
