import type { MoodState, ResetCompletion } from "@/lib/use-reset-anchors";

const MOOD_LABEL: Record<MoodState, string> = {
  calm: "Calm",
  clear: "Clear",
  scattered: "Scattered",
  low: "Low",
  tense: "Tense",
  energized: "Energized",
};

/** Lower = more dysregulated; higher = more settled (rough ordinal scale). */
const MOOD_VALENCE: Record<MoodState, number> = {
  tense: 1,
  scattered: 2,
  low: 3,
  energized: 4,
  clear: 5,
  calm: 6,
};

export function formatMoodLabel(mood?: MoodState): string | null {
  if (!mood) return null;
  return MOOD_LABEL[mood] ?? mood;
}

export function formatMoodDelta(pre?: MoodState, post?: MoodState): string | null {
  if (!pre || !post) return null;
  const preLabel = formatMoodLabel(pre);
  const postLabel = formatMoodLabel(post);
  if (!preLabel || !postLabel) return null;
  if (pre === post) return `Still ${postLabel.toLowerCase()}.`;
  return `${preLabel} → ${postLabel}`;
}

function completionMoods(c: ResetCompletion): { pre?: MoodState; post?: MoodState } {
  return {
    pre: c.preMood ?? (c.pre_mood as MoodState | undefined),
    post: c.postMood ?? (c.post_mood as MoodState | undefined),
  };
}

export function getAnchorMoodInsight(
  completions: ResetCompletion[],
  anchorId: string,
): string | null {
  const relevant = completions.filter((c) => {
    if (c.anchorId !== anchorId && c.anchor_id !== anchorId) return false;
    const { pre, post } = completionMoods(c);
    return !!(pre && post);
  });
  if (relevant.length === 0) return null;

  let improved = 0;
  for (const c of relevant) {
    const { pre, post } = completionMoods(c);
    if (!pre || !post) continue;
    if (MOOD_VALENCE[post] > MOOD_VALENCE[pre]) improved++;
  }

  if (improved === 0) return null;
  const fraction = improved / relevant.length;
  if (fraction >= 0.6) {
    return `This reset has helped shift your mood ${improved} of the last ${relevant.length} times.`;
  }
  return null;
}

export interface RecentSessionSummary {
  id: string;
  anchorId: string;
  date: string;
  duration: number;
  moodDelta: string | null;
}

export function getRecentSessionSummaries(
  completions: ResetCompletion[],
  limit = 7,
): RecentSessionSummary[] {
  return [...completions]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((c) => {
      const { pre, post } = completionMoods(c);
      return {
        id: c.id,
        anchorId: c.anchorId || c.anchor_id || "",
        date: c.date || c.date_key || "",
        duration: c.duration,
        moodDelta: formatMoodDelta(pre, post),
      };
    });
}
