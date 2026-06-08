"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

import { parseLifePriorities, type LifePriorityId } from "@/lib/life-priorities";

export interface UserPreferences {
  voice_overlay_enabled: boolean;
  golden_mode_enabled: boolean;
  briefing_time: string;
  briefing_includes: string;
  onboarding_complete: boolean;
  life_priorities: LifePriorityId[];
  life_priorities_set: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  voice_overlay_enabled: false,
  golden_mode_enabled: false,
  briefing_time: "07:00",
  briefing_includes: "finance,health,calendar,goals",
  onboarding_complete: false,
  life_priorities: [],
  life_priorities_set: false,
};

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<UserPreferences & { life_priorities?: string | string[] }>(
        "/api/preferences",
      );
      setPrefs({
        ...DEFAULT_PREFS,
        ...data,
        life_priorities: parseLifePriorities(data.life_priorities),
        life_priorities_set: Boolean(data.life_priorities_set),
      });
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    const { life_priorities: ids, ...rest } = patch;
    const apiPatch: Record<string, unknown> = { ...rest };
    if (ids !== undefined) {
      apiPatch.life_priorities = ids.join(",");
    }
    const boolToInt = (key: keyof UserPreferences, v: boolean) => {
      apiPatch[key] = v ? 1 : 0;
    };
    if (rest.life_priorities_set !== undefined) {
      boolToInt("life_priorities_set", rest.life_priorities_set);
    }
    if (rest.onboarding_complete !== undefined) {
      boolToInt("onboarding_complete", rest.onboarding_complete);
    }
    if (rest.voice_overlay_enabled !== undefined) {
      boolToInt("voice_overlay_enabled", rest.voice_overlay_enabled);
    }
    if (rest.golden_mode_enabled !== undefined) {
      boolToInt("golden_mode_enabled", rest.golden_mode_enabled);
    }
    setPrefs((prev) => ({ ...prev, ...patch }));
    try {
      await api.patch("/api/preferences", apiPatch);
    } catch {
      // revert on failure
      setPrefs((prev) => ({ ...prev }));
    }
  }, []);

  return { prefs, loading, update, reload: load };
}
