"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

interface ForecastData {
  income: number;
  balance: number;
  month_spent: number;
  total_monthly_bills: number;
  bills: { name: string; amount: number; next_due: string; frequency: string }[];
  total_goal_remaining: number;
  goals_summary: { name: string; target_amount: number; current_amount: number; target_date: string }[];
  projected_remaining: number;
  free_after_goals: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

const DEMO_FORECAST: ForecastData = {
  income: 6500,
  balance: 5500,
  month_spent: 2862,
  total_monthly_bills: 2258,
  bills: [
    { name: "Rent",    amount: 2200,  next_due: "2026-05-01", frequency: "monthly" },
    { name: "Netflix", amount: 15.99, next_due: "2026-04-24", frequency: "monthly" },
    { name: "Gym",     amount: 29.99, next_due: "2026-04-28", frequency: "monthly" },
  ],
  total_goal_remaining: 4680,
  goals_summary: [
    { name: "Vacation Fund",  target_amount: 4000, current_amount: 2720, target_date: "2026-12-01" },
    { name: "Emergency Fund", target_amount: 5000, current_amount: 1600, target_date: "" },
  ],
  projected_remaining: 1560,
  free_after_goals: 880,
};

export function ForecastTab() {
  const [data, setData] = useState<ForecastData | null>(null);

  useEffect(() => {
    if (isDemo()) { setData(DEMO_FORECAST); return; }
    api.get<ForecastData>("/api/forecast").then(setData).catch(() => {});
  }, []);

  if (!data) {
    return <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>;
  }

  return (
    <div>
      {/* Quick numbers */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-3">
            <p className="text-[0.6rem] uppercase tracking-wide text-white/30">Monthly Income</p>
            <p className="text-xl font-bold">{data.income > 0 ? fmt(data.income) : "—"}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-3">
            <p className="text-[0.6rem] uppercase tracking-wide text-white/30">Free to Spend</p>
            <p className="text-xl font-bold text-green-400">{fmt(data.free_after_goals)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Waterfall summary */}
      <div className="mb-5">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Monthly Cash Flow</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/60">Current balance</span>
            <span className="font-semibold">{fmt(data.balance)}</span>
          </div>
          {data.income > 0 && (
            <div className="flex justify-between">
              <span className="text-green-400/80">+ Monthly income</span>
              <span className="font-semibold text-green-400">{fmt(data.income)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-red-400/80">− Monthly bills</span>
            <span className="font-semibold text-red-400">{fmt(data.total_monthly_bills)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-400/80">− Goal contributions</span>
            <span className="font-semibold text-yellow-400">{fmt(data.total_goal_remaining)}</span>
          </div>
          <div className="flex justify-between border-t border-white/5 pt-2">
            <span className="font-bold">Projected remaining</span>
            <span className="font-bold text-green-400">{fmt(data.projected_remaining)}</span>
          </div>
        </div>
      </div>

      {/* Upcoming bills */}
      {data.bills.length > 0 && (
        <div className="mb-5">
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Upcoming Bills</p>
          {data.bills.map((b, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
              <div>
                <p className="text-white">{b.name}</p>
                <p className="text-[0.65rem] text-white/25">{b.frequency} · Due {b.next_due}</p>
              </div>
              <span className="font-semibold">{fmt(b.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
