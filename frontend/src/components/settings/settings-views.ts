import type { View } from "./types";

/** Leaf settings sub-panels rendered by SettingsViewContent (excludes main menu null). */
export const SETTINGS_SUB_PANEL_VIEWS = [
  "security-access",
  "security",
  "sessions",
  "connected",
  "privacy-safety",
  "data",
  "notifications",
  "financial",
  "subscription",
  "account",
  "app",
  "memory",
  "health",
  "location",
  "briefing",
  "accessibility",
] as const satisfies readonly Exclude<View, null>[];

export type SettingsSubPanelView = (typeof SETTINGS_SUB_PANEL_VIEWS)[number];
