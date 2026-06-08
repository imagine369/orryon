"use client";

import type { MoodState } from "@/lib/use-reset-anchors";

interface MoodOption {
  id: MoodState;
  label: string;
  icon: React.ReactNode;
}

export function CalmIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M4 12 Q8 10 12 12 Q16 14 20 12" />
    </svg>
  );
}

export function ClearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ScatteredIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <line x1="7" y1="8" x2="9" y2="10" />
      <line x1="12" y1="6" x2="12" y2="9" />
      <line x1="17" y1="8" x2="15" y2="10" />
      <line x1="6" y1="14" x2="9" y2="14" />
      <line x1="15" y1="14" x2="18" y2="14" />
    </svg>
  );
}

export function LowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5 9 Q9 9 12 13 Q15 17 19 17" />
    </svg>
  );
}

export function TenseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,12 7,8 10,12 13,8 16,12 19,8" />
    </svg>
  );
}

export function EnergizedIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M5 16 Q9 14 12 10 Q15 6 19 5" />
      <polyline points="15,5 19,5 19,9" />
    </svg>
  );
}

export const MOOD_OPTIONS: MoodOption[] = [
  { id: "calm", label: "Calm", icon: <CalmIcon /> },
  { id: "clear", label: "Clear", icon: <ClearIcon /> },
  { id: "scattered", label: "Scattered", icon: <ScatteredIcon /> },
  { id: "low", label: "Low", icon: <LowIcon /> },
  { id: "tense", label: "Tense", icon: <TenseIcon /> },
  { id: "energized", label: "Energized", icon: <EnergizedIcon /> },
];
