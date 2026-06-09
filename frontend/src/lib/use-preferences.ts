"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api } from "@/lib/api";

import { parseLifePriorities, type LifePriorityId } from "@/lib/life-priorities";
import {
  clampAmbientSensitivity,
  normalizeAmbientSoundStyle,
  type AmbientSoundStyle,
} from "@/lib/ambient-plan";

export interface UserPreferences {
  voice_overlay_enabled: boolean;
  golden_mode_enabled: boolean;
  briefing_time: string;
  briefing_includes: string;
  onboarding_complete: boolean;
  life_priorities: LifePriorityId[];
  life_priorities_set: boolean;
  ambient_mode_enabled: boolean;
  ambient_sensitivity: number;
  ambient_sound_style: AmbientSoundStyle;
}

const DEFAULT_PREFS: UserPreferences = {
  voice_overlay_enabled: false,
  golden_mode_enabled: false,
  briefing_time: "07:00",
  briefing_includes: "finance,health,calendar,goals",
  onboarding_complete: false,
  life_priorities: [],
  life_priorities_set: false,
  ambient_mode_enabled: false,
  ambient_sensitivity: 0.5,
  ambient_sound_style: "soft_glow_rise",
};

export interface PreferencesContextValue {
  prefs: UserPreferences;
  loading: boolean;
  update: (patch: Partial<UserPreferences>) => Promise<void>;
  reload: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
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
        ambient_mode_enabled: Boolean(data.ambient_mode_enabled),
        ambient_sensitivity: clampAmbientSensitivity(
          Number(data.ambient_sensitivity ?? DEFAULT_PREFS.ambient_sensitivity),
        ),
        ambient_sound_style: normalizeAmbientSoundStyle(data.ambient_sound_style),
      });
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useQueuedEffect(() => {
    void load();
  }, [load]);

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
    if (rest.ambient_mode_enabled !== undefined) {
      boolToInt("ambient_mode_enabled", rest.ambient_mode_enabled);
    }
    if (rest.ambient_sensitivity !== undefined) {
      apiPatch.ambient_sensitivity = clampAmbientSensitivity(rest.ambient_sensitivity);
    }
    if (rest.ambient_sound_style !== undefined) {
      apiPatch.ambient_sound_style = normalizeAmbientSoundStyle(rest.ambient_sound_style);
    }
    let snapshot: UserPreferences | null = null;
    setPrefs((prev) => {
      snapshot = prev;
      return { ...prev, ...patch };
    });
    try {
      await api.patch("/api/preferences", apiPatch);
    } catch {
      if (snapshot) setPrefs(snapshot);
    }
  }, []);

  const value = useMemo(
    () => ({ prefs, loading, update, reload: load }),
    [prefs, loading, update, load],
  );

  return createElement(PreferencesContext.Provider, { value }, children);
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}
