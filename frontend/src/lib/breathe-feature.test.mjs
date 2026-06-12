import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  isRhythmStep,
  getBreathPhaseInfo,
  inferBreathPhaseFromStep,
  getBreathPatternCycleIndex,
  buildBreathPhaseCueKey,
  shouldPlayBreathPhaseTone,
  getOrbBreathState,
} from "./breath-phase.ts";
import { getHapticPatternForStep } from "./breathing-sounds.ts";
import { buildCustomLoopAnchor, DEFAULT_CUSTOM_LOOP, resolveStartAnchor, CUSTOM_LOOP_ANCHOR_ID } from "./custom-breath-loop.ts";
import { getAnchorMoodInsight, formatMoodDelta } from "./reset-mood-insights.ts";
import {
  getAnchorById,
  getInstantAnchors,
  getSessionAnchors,
  resolvedDuration,
  RESET_ANCHORS,
} from "./reset-scripts.ts";

describe("breath-phase", () => {
  it("isRhythmStep is true only for pattern steps without guided copy", () => {
    const clarity = getAnchorById("clarity-breath-2min");
    assert.ok(clarity);
    const doubleInhaleStep = clarity.steps[1]; // orb-double + pattern + text
    const boxStep = clarity.steps[2]; // orb with pattern + text
    const customLoop = buildCustomLoopAnchor(DEFAULT_CUSTOM_LOOP).steps[1];
    assert.equal(isRhythmStep(doubleInhaleStep), false);
    assert.equal(isRhythmStep(boxStep), false);
    assert.equal(isRhythmStep(customLoop), true);
  });

  it("getBreathPhaseInfo returns labels for patterned steps only", () => {
    const clarity = getAnchorById("clarity-breath-2min");
    const boxStep = clarity.steps[2];
    const info = getBreathPhaseInfo(boxStep, 16, 15);
    assert.equal(info.phase, "inhale");
    assert.match(info.label, /Inhale · 4s/);

    const guidedStep = clarity.steps[0];
    const guidedInfo = getBreathPhaseInfo(guidedStep, 20, 15);
    assert.equal(guidedInfo.phase, null);
    assert.equal(guidedInfo.label, null);
  });

  it("quick box uses a repeating box-breath pattern with phase tones", () => {
    const box = getAnchorById("quick-box-reset");
    assert.ok(box);
    const breathStep = box.steps[1];
    assert.ok(breathStep.breathPattern);
    assert.equal(breathStep.breathPattern.inSecs, 4);
    assert.equal(breathStep.breathPattern.holdInSecs, 4);
    assert.equal(breathStep.breathPattern.outSecs, 4);
    assert.equal(breathStep.breathPattern.holdOutSecs, 4);
    assert.equal(shouldPlayBreathPhaseTone(breathStep), true);
  });

  it("infers breath phases for double-inhale sigh steps", () => {
    const sigh = getAnchorById("double-inhale-destress");
    assert.ok(sigh);
    assert.equal(inferBreathPhaseFromStep(sigh.steps[1]), "inhale");
    assert.equal(inferBreathPhaseFromStep(sigh.steps[2]), "hold-in");
    assert.equal(inferBreathPhaseFromStep(sigh.steps[3]), "exhale");
  });

  it("builds unique cue keys for each breath cycle in grounding", () => {
    const grounding = getAnchorById("grounding-anchor-3min");
    assert.ok(grounding);
    const breathStep = grounding.steps[0];
    assert.equal(getBreathPatternCycleIndex(breathStep, 0, 0), 0);
    assert.equal(getBreathPatternCycleIndex(breathStep, 10, 0), 1);
    assert.equal(getBreathPatternCycleIndex(breathStep, 20, 0), 2);

    const cycle0Inhale = buildBreathPhaseCueKey({
      stepIdx: 0,
      phase: "inhale",
      step: breathStep,
      elapsed: 0,
      stepStartSec: 0,
    });
    const cycle1Inhale = buildBreathPhaseCueKey({
      stepIdx: 0,
      phase: "inhale",
      step: breathStep,
      elapsed: 10,
      stepStartSec: 0,
    });
    assert.notEqual(cycle0Inhale, cycle1Inhale);
  });

  it("every breathing exercise except Do Nothing exposes phase cues", () => {
    const noBreathCues = new Set(["do-nothing"]);
    for (const anchor of RESET_ANCHORS) {
      if (noBreathCues.has(anchor.id)) continue;
      const hasCues = anchor.steps.some((step) => shouldPlayBreathPhaseTone(step));
      assert.ok(hasCues, `${anchor.id} should include breath phase cues`);
    }
  });

  it("getOrbBreathState uses step duration for discrete double-inhale steps", () => {
    const sigh = getAnchorById("double-inhale-destress");
    assert.ok(sigh);
    const exhaleStep = sigh.steps[3];
    const orb = getOrbBreathState(exhaleStep, 12, 11);
    assert.equal(orb.expanded, false);
    assert.equal(orb.transitionSecs, 8);

    const sniffStep = sigh.steps[2];
    const sniffOrb = getOrbBreathState(sniffStep, 7, 6);
    assert.equal(sniffOrb.expanded, true);
    assert.equal(sniffOrb.transitionSecs, 1);
  });

  it("getOrbBreathState uses phase length for patterned box breathing", () => {
    const box = getAnchorById("quick-box-reset");
    assert.ok(box);
    const breathStep = box.steps[1];
    const inhale = getOrbBreathState(breathStep, 2, 0);
    assert.equal(inhale.expanded, true);
    assert.equal(inhale.transitionSecs, 4);

    const exhale = getOrbBreathState(breathStep, 10, 0);
    assert.equal(exhale.expanded, false);
    assert.equal(exhale.transitionSecs, 4);
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
