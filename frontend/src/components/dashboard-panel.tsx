"use client";

import { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { usePanels } from "@/lib/panel-context";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BudgetTab } from "@/components/dashboard/budget-tab";
import { ForecastTab } from "@/components/dashboard/forecast-tab";
import { ScheduleTab } from "@/components/dashboard/schedule-tab";
import { GoalsTab } from "@/components/dashboard/goals-tab";
import { NotesTab } from "@/components/dashboard/notes-tab";
import { InsightsTab } from "@/components/dashboard/insights-tab";
import { BillsTab } from "@/components/dashboard/bills-tab";
import { YearlyTab } from "@/components/dashboard/yearly-tab";
import { OverviewTab } from "@/components/dashboard/overview-tab";

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

export function DashboardPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "dashboard";
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(() => {
    if (isOpen) {
      api.get<DashboardData>("/api/dashboard/stats").then(setData).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => { load(); }, [load]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="dashboard-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          {/* Panel */}
          <motion.div
            key="dashboard-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.2, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) close();
            }}
            className="fixed top-0 right-0 h-full z-50 flex flex-col"
            style={{ width: "95vw", maxWidth: 600 }}
          >
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl overflow-y-auto flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-6 pb-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl">
                <h1 className="text-2xl font-extrabold">Dashboard</h1>
                <button
                  onClick={close}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                </button>
              </div>

              <div className="px-5 py-4 flex-1">
                {!data ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  </div>
                ) : (
                  <>
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
                    <Tabs defaultValue="notes">
                      <TabsList className="bg-[#111] border border-white/5 p-0.5 mb-4 h-auto w-full overflow-x-auto flex-nowrap justify-start scrollbar-none">
                        <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
                        <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
                        <TabsTrigger value="budget" className="text-xs">Budget</TabsTrigger>
                        <TabsTrigger value="bills" className="text-xs">Bills</TabsTrigger>
                        <TabsTrigger value="goals" className="text-xs">Goals</TabsTrigger>
                        <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                        <TabsTrigger value="forecast" className="text-xs">Forecast</TabsTrigger>
                        <TabsTrigger value="yearly" className="text-xs">Yearly</TabsTrigger>
                        <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview"><OverviewTab /></TabsContent>

                      <TabsContent value="insights"><InsightsTab /></TabsContent>
                      <TabsContent value="yearly"><YearlyTab /></TabsContent>
                      <TabsContent value="budget"><BudgetTab /></TabsContent>
                      <TabsContent value="bills"><BillsTab /></TabsContent>
                      <TabsContent value="forecast"><ForecastTab /></TabsContent>
                      <TabsContent value="schedule"><ScheduleTab /></TabsContent>
                      <TabsContent value="goals"><GoalsTab /></TabsContent>
                      <TabsContent value="notes"><NotesTab /></TabsContent>
                    </Tabs>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
