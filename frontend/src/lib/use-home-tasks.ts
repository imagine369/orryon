"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useDataRefresh } from "@/lib/use-data-refresh";
import { useQueuedEffect } from "@/lib/use-queued-effect";

/** Today's open task count for the home empty state. */
export function useHomeTasksDueToday() {
  const [tasksDueToday, setTasksDueToday] = useState<number | null>(null);

  const reload = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    api
      .get<{ open_tasks: { due_date: string }[] }>("/api/dashboard/stats")
      .then((stats) => {
        if (stats?.open_tasks) {
          const count = stats.open_tasks.filter((t) => t.due_date === today).length;
          setTasksDueToday(count);
        }
      })
      .catch(() => {});
  }, []);

  useQueuedEffect(() => reload(), [reload]);
  useDataRefresh(["today", "schedule", "calendar", "dashboard"], reload);

  return tasksDueToday;
}
