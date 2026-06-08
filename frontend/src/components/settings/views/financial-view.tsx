"use client";

import type { SettingsPanel } from "../panel-types";
import { Row, SelectField } from "../ui";
import { CURRENCIES, ALERT_PCTS } from "../constants";

export function FinancialView({ panel }: { panel: SettingsPanel }) {
  const { settings, patch } = panel;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
      <Row
        label="Currency"
        sublabel="Used for display across the app"
        right={
          <select
            value={settings!.currency || "USD"}
            onChange={(e) => patch({ currency: e.target.value })}
            className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 cursor-pointer max-w-[160px]"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        }
      />
      <Row
        label="Budget cycle starts"
        sublabel="Day of month your budget resets"
        right={
          <SelectField
            value={settings!.budget_cycle_start || 1}
            onChange={(v) => patch({ budget_cycle_start: parseInt(v) })}
            options={Array.from({ length: 28 }, (_, i) => ({
              label: i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`,
              value: i + 1,
            }))}
          />
        }
      />
      <Row
        label="Spending alert"
        sublabel="Notify when category reaches"
        right={
          <SelectField
            value={settings!.spending_alert_pct || 80}
            onChange={(v) => patch({ spending_alert_pct: parseInt(v) })}
            options={ALERT_PCTS}
          />
        }
      />
    </div>
  );
}
