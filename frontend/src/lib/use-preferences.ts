"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export interface UserPreferences {
  voice_overlay_enabled: boolean;
  golden_mode_enabled: boolean;
  live_orryon_enabled: boolean;
  briefing_time: string;
  briefing_includes: string;
  onboarding_complete: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  voice_overlay_enabled: false,
  golden_mode_enabled: false,
  live_orryon_enabled: true,
  briefing_time: "07:00",
  briefing_includes: "finance,health,calendar,goals",
  onboarding_complete: false,
};

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<UserPreferences>("/api/preferences");
      setPrefs(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    try {
      await api.patch("/api/preferences", patch);
    } catch {
      // revert on failure
      setPrefs((prev) => ({ ...prev }));
    }
  }, []);

  return { prefs, loading, update, reload: load };
}
