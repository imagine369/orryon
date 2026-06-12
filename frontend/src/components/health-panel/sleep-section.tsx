"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import {
  useSleepLogs, build7d, build30d, build3m, type SleepDataPoint,
} from "@/lib/use-sleep-logs";
import { HealthRange, RANGE_LABELS } from "./shared";

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function sleepBarColor(pt: SleepDataPoint): string {
  if (!pt.hasData) return "rgba(255,255,255,0.06)";
  if (pt.hours >= 7) return "rgba(134,239,172,0.75)";
  if (pt.hours >= 5) return "rgba(251,191,36,0.75)";
  return "rgba(248,113,113,0.75)";
}

function SleepTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: SleepDataPoint }[];
  range: HealthRange;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  if (!pt.hasData) return null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs">
      <p className="text-white/60 mb-0.5">
        {range === "3m" ? `Week of ${pt.label}` : pt.label}
      </p>
      <p className="text-white font-semibold">
        {fmtHours(pt.hours)}{range === "3m" ? " avg" : ""}
      </p>
    </div>
  );
}

// ── Sleep Section ─────────────────────────────────────────────────────────────

export function SleepSection() {
  const { byDate, loading, summary } = useSleepLogs();
  const [range, setRange] = useState<HealthRange>("7d");

  const chartData = useMemo(() => {
    if (range === "7d") return build7d(byDate);
    if (range === "30d") return build30d(byDate);
    return build3m(byDate);
  }, [byDate, range]);

  const hasAnyData = Object.keys(byDate).length > 0;

  const rangeCaption =
    chartData.length > 0
      ? `${chartData[0].label} – ${chartData[chartData.length - 1].label}`
      : "";

  return (
    <div className="px-5 pt-4 pb-4">
      {/* Range toggle */}
      {!loading && hasAnyData && (
        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {(Object.keys(RANGE_LABELS) as HealthRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={
                  "px-2.5 py-1 rounded-md text-xs font-medium transition " +
                  (range === r ? "bg-white/10 text-white/90" : "text-white/35 hover:text-white/60")
                }
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <div className="h-[90px] rounded-lg bg-white/[0.03] animate-pulse" />
      ) : !hasAnyData ? (
        <div className="h-[90px] rounded-lg bg-white/[0.03] flex items-center justify-center px-4">
          <p className="text-xs text-white/20 text-center">
            Tell orryon how you slept — e.g. &ldquo;I slept 7 hours last night&rdquo;
          </p>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div style={{ width: "100%", height: 90 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="12%"
              >
                <XAxis dataKey="label" hide />
                <YAxis domain={[0, 10]} hide />
                <ReferenceLine
                  y={7}
                  stroke="rgba(134,239,172,0.25)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <Tooltip
                  content={<SleepTooltip range={range} />}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="hours" radius={[2, 2, 0, 0]} maxBarSize={28} minPointSize={2}>
                  {chartData.map((pt, idx) => (
                    <Cell key={`sleep-cell-${idx}`} fill={sleepBarColor(pt)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Date range caption */}
          <p className="text-[0.6rem] text-white/20 mt-1 tracking-wide">{rangeCaption}</p>

          {/* Summary stats — always last 7 days regardless of chart range */}
          <div className="flex gap-5 mt-4">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Last Night
              </p>
              <p className="text-sm font-bold text-white/80">{fmtHours(summary.lastNight)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                7-Day Avg
              </p>
              <p className="text-sm font-bold text-white/80">{fmtHours(summary.weekAvg)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Best This Week
              </p>
              <p className="text-sm font-bold text-white/80">{fmtHours(summary.weekBest)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
