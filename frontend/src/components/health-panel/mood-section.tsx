"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import {
  useMoodLogs, buildMood7d, buildMood30d, buildMood3m, type MoodDataPoint,
} from "@/lib/use-mood-logs";
import { HealthRange, RANGE_LABELS } from "./shared";

function fmtMoodScore(score: number | null): string {
  if (score === null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function moodBarColor(pt: MoodDataPoint): string {
  if (!pt.hasData) return "rgba(255,255,255,0.06)";
  if (pt.value >= 4.5) return "rgba(134,239,172,0.80)";  // 5 — great
  if (pt.value >= 3.5) return "rgba(74,222,128,0.70)";   // 4 — good
  if (pt.value >= 2.5) return "rgba(251,191,36,0.70)";   // 3 — okay
  if (pt.value >= 1.5) return "rgba(251,146,60,0.70)";   // 2 — low
  return "rgba(248,113,113,0.75)";                        // 1 — rough
}

function MoodTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: MoodDataPoint }[];
  range: HealthRange;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  if (!pt.hasData) return null;
  const words = ["", "Rough", "Low", "Okay", "Good", "Great"];
  const label = Number.isInteger(pt.value) && pt.value >= 1 && pt.value <= 5
    ? words[Math.round(pt.value)]
    : null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs">
      <p className="text-white/60 mb-0.5">
        {range === "3m" ? `Week of ${pt.label}` : pt.label}
      </p>
      <p className="text-white font-semibold">
        {fmtMoodScore(pt.value)}{range === "3m" ? " avg" : label ? ` — ${label}` : ""}
      </p>
    </div>
  );
}

// ── Mood Section ──────────────────────────────────────────────────────────────

export function MoodSection() {
  const { byDate, loading, summary } = useMoodLogs();
  const [range, setRange] = useState<HealthRange>("7d");

  const chartData = useMemo(() => {
    if (range === "7d") return buildMood7d(byDate);
    if (range === "30d") return buildMood30d(byDate);
    return buildMood3m(byDate);
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
            Tell orryon how you&apos;re feeling — e.g. &ldquo;mood is 4 out of 5 today&rdquo;
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
                <YAxis domain={[0, 5]} hide />
                <ReferenceLine
                  y={3}
                  stroke="rgba(255,255,255,0.10)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <Tooltip
                  content={<MoodTooltip range={range} />}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={28} minPointSize={2}>
                  {chartData.map((pt, idx) => (
                    <Cell key={`mood-cell-${idx}`} fill={moodBarColor(pt)} />
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
                Today
              </p>
              <p className="text-sm font-bold text-white/80">{fmtMoodScore(summary.today)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                7-Day Avg
              </p>
              <p className="text-sm font-bold text-white/80">{fmtMoodScore(summary.weekAvg)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Best This Week
              </p>
              <p className="text-sm font-bold text-white/80">{fmtMoodScore(summary.weekBest)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
