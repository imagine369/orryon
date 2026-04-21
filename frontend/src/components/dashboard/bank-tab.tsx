"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useDataRefresh } from "@/lib/use-data-refresh";

interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

export function BankTab() {
  const [selectedMonth, setSelectedMonth] = useState(nowMonth);
  const [balance, setBalance] = useState<number | null>(null);
  const [deposits, setDeposits] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const isCurrentMonth = selectedMonth === nowMonth();

  const reload = useCallback(() => {
    if (isDemo()) {
      setBalance(5500);
      setDeposits([
        { id: "d1", merchant: "Paycheck", amount: -3200, date: "2026-04-01", category: "Income" },
        { id: "d2", merchant: "Freelance", amount: -450, date: "2026-04-12", category: "Income" },
      ]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [year, month] = selectedMonth.split("-");
    const from = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

    const fetches: Promise<unknown>[] = [
      api
        .get<Transaction[]>(`/api/transactions?date_from=${from}&date_to=${to}&limit=500`)
        .then((txns) => {
          const income = txns
            .filter((t) => t.amount < 0)
            .sort((a, b) => b.date.localeCompare(a.date));
          setDeposits(income);
        }),
    ];

    if (isCurrentMonth) {
      fetches.push(
        api
          .get<{ balance: number }>("/api/dashboard/stats")
          .then((d) => setBalance(d.balance))
      );
    } else {
      setBalance(null);
    }

    Promise.all(fetches)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMonth, isCurrentMonth]);

  useEffect(() => {
    reload();
  }, [reload]);
  useDataRefresh(["dashboard", "budget", "forecast"], reload);

  const totalDeposited = deposits.reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div>
      {/* Month nav */}
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

      {/* Balance + total deposited */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {balance !== null && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-1">Balance</p>
            <p className="text-xl font-bold">{fmt(balance)}</p>
          </div>
        )}
        <div className={`bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 ${balance === null ? "col-span-2" : ""}`}>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-1">Deposited</p>
          <p className="text-xl font-bold text-emerald-400">{loading ? "—" : fmt(totalDeposited)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : deposits.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-10">
          No deposits for {formatMonthLabel(selectedMonth)}.
        </p>
      ) : (
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/25 mb-2">Deposits</p>
          {deposits.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between py-3 border-b border-white/5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate">{t.merchant}</p>
                <p className="text-[0.7rem] text-white/25">{formatDate(t.date)}</p>
              </div>
              <span className="text-sm font-semibold text-emerald-400 ml-3">
                +{fmt(Math.abs(t.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
