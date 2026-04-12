"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BudgetTab } from "@/components/dashboard/budget-tab";
import { ForecastTab } from "@/components/dashboard/forecast-tab";
import { ScheduleTab } from "@/components/dashboard/schedule-tab";
import { GoalsTab } from "@/components/dashboard/goals-tab";
import { NotesTab } from "@/components/dashboard/notes-tab";
import { TodayTab } from "@/components/dashboard/today-tab";
import { SlideInFromLeft } from "@/components/motion";

interface DashboardData {
  balance: number;
  month_spend: number;
  top_categories: { category: string; total: number }[];
  recent_transactions: { id: string; merchant: string; amount: number; date: string; category: string }[];
  upcoming_events: { id: string; title: string; event_date: string; event_type: string }[];
  active_goals: { id: string; name: string; target_amount: number; current_amount: number }[];
  open_tasks: { id: string; title: string; priority: string; due_date: string }[];
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(() => {
    api.get<DashboardData>("/api/dashboard/stats").then(setData).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <SlideInFromLeft className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header + Quick Add */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-4">
            <p className="text-[0.65rem] uppercase tracking-wide text-white/35 mb-1">Net Balance</p>
            <p className="text-2xl font-bold">{fmt(data.balance)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardContent className="p-4">
            <p className="text-[0.65rem] uppercase tracking-wide text-white/35 mb-1">This Month</p>
            <p className="text-2xl font-bold">{fmt(data.month_spend)}</p>
            <p className="text-[0.7rem] text-white/25">spent</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="today">
        <TabsList className="bg-[#111] border border-white/5 p-0.5 mb-4 flex-wrap h-auto">
          <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">Budget</TabsTrigger>
          <TabsTrigger value="goals" className="text-xs">Goals</TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="forecast" className="text-xs">Forecast</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB (inlined — top categories + recent txns) */}
        <TabsContent value="overview">
          {data.top_categories.length > 0 && (
            <div className="mb-5">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Top Categories</p>
              {data.top_categories.map((c) => (
                <div key={c.category} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                  <span className="text-white/80">{c.category}</span>
                  <span className="font-semibold">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}

          {data.recent_transactions.length > 0 && (
            <div className="mb-5">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Recent Transactions</p>
              {data.recent_transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">{t.merchant}</p>
                    <p className="text-[0.7rem] text-white/25">{t.category} · {t.date}</p>
                  </div>
                  <span className="font-semibold text-white ml-3">-{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {data.open_tasks.length > 0 && (
            <div>
              <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Open Tasks</p>
              {data.open_tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2 border-b border-white/5 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.priority === "high" ? "bg-red-400" : t.priority === "medium" ? "bg-yellow-400" : "bg-green-400"}`} />
                  <span className="text-white/80 flex-1">{t.title}</span>
                  {t.due_date && <span className="text-white/25 text-xs">{t.due_date}</span>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="today"><TodayTab /></TabsContent>
        <TabsContent value="budget"><BudgetTab /></TabsContent>
        <TabsContent value="forecast"><ForecastTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="goals"><GoalsTab /></TabsContent>
        <TabsContent value="notes"><NotesTab /></TabsContent>
      </Tabs>
    </SlideInFromLeft>
  );
}
