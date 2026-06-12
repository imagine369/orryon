import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { isRhythmStep, getBreathPhaseInfo } from "./breath-phase.ts";
import { getHapticPatternForStep } from "./breathing-sounds.ts";
import { buildCustomLoopAnchor, DEFAULT_CUSTOM_LOOP, resolveStartAnchor, CUSTOM_LOOP_ANCHOR_ID } from "./custom-breath-loop.ts";
import { getAnchorMoodInsight, formatMoodDelta } from "./reset-mood-insights.ts";
import {
  getAnchorById,
  getInstantAnchors,
  getSessionAnchors,
  resolvedDuration,
} from "./reset-scripts.ts";

describe("breath-phase", () => {
  it("isRhythmStep is true only when breathPattern exists", () => {
    const clarity = getAnchorById("clarity-breath-2min");
    assert.ok(clarity);
    const doubleInhaleStep = clarity.steps[1]; // orb-double, no pattern
    const boxStep = clarity.steps[2]; // orb with pattern
    assert.equal(isRhythmStep(doubleInhaleStep), false);
    assert.equal(isRhythmStep(boxStep), true);
  });

  it("getBreathPhaseInfo returns labels for patterned steps only", () => {
    const clarity = getAnchorById("clarity-breath-2min");
    const boxStep = clarity.steps[2];
    const info = getBreathPhaseInfo(boxStep, 16, 15);
    assert.equal(info.phase, "inhale");
    assert.match(info.label, /Inhale · 4s/);

    const guidedStep = clarity.steps[1];
    const guidedInfo = getBreathPhaseInfo(guidedStep, 20, 15);
    assert.equal(guidedInfo.phase, null);
    assert.equal(guidedInfo.label, null);
  });
});

describe("breathing-sounds haptics", () => {
  it("does not classify 'pack it in' as inhale", () => {
    const pattern = getHapticPatternForStep(
      "double-inhale-destress",
      2,
      "Sharp sniff — pack it in.",
    );
    assert.deepEqual(pattern, [40]);
  });

  it("classifies explicit inhale copy", () => {
    const pattern = getHapticPatternForStep(
      "double-inhale-destress",
      1,
      "Inhale through your nose.",
    );
    assert.deepEqual(pattern, [60, 40, 60]);
  });
});

describe("custom breath loop", () => {
  it("clamps cycles to at least 1", () => {
    const anchor = buildCustomLoopAnchor({ ...DEFAULT_CUSTOM_LOOP, cycles: 0 });
    const breathStep = anchor.steps[1];
    assert.ok(breathStep.breathPattern);
    const cycleLen =
      breathStep.breathPattern.inSecs +
      breathStep.breathPattern.holdInSecs +
      breathStep.breathPattern.outSecs +
      breathStep.breathPattern.holdOutSecs;
    assert.equal(breathStep.duration, cycleLen * 1);
  });

  it("resolveStartAnchor maps catalog and custom-loop ids", () => {
    assert.equal(resolveStartAnchor("not-real"), null);
    assert.equal(resolveStartAnchor(CUSTOM_LOOP_ANCHOR_ID), null);
    assert.equal(
      resolveStartAnchor("double-inhale-destress")?.id,
      "double-inhale-destress",
    );
  });
});

describe("reset-mood-insights", () => {
  it("includes API snake_case mood fields", () => {
    const insight = getAnchorMoodInsight(
      [
        {
          id: "rc_1",
          anchorId: "quick-box-reset",
          anchor_id: "quick-box-reset",
          date: "2026-06-11",
          duration: 180,
          pre_mood: "tense",
          post_mood: "calm",
          markedForStreak: false,
        },
      ],
      "quick-box-reset",
    );
    assert.match(insight, /helped shift your mood/);
  });

  it("formatMoodDelta handles unchanged mood", () => {
    assert.equal(formatMoodDelta("calm", "calm"), "Still calm.");
  });
});

describe("reset-scripts catalog", () => {
  it("exposes instant and session anchors", () => {
    assert.equal(getInstantAnchors().length, 2);
    assert.equal(getSessionAnchors().length, 7);
  });

  it("resolvedDuration respects duration options", () => {
    const box = getAnchorById("quick-box-reset");
    assert.equal(resolvedDuration(box, 0), 180);
    assert.equal(resolvedDuration(box, 2), 540);
  });
});
