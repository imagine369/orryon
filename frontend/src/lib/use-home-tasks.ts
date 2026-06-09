"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Today's open task count for the home empty state. */
export function useHomeTasksDueToday() {
  const [tasksDueToday, setTasksDueToday] = useState<number | null>(null);

  useEffect(() => {
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

  return tasksDueToday;
}
