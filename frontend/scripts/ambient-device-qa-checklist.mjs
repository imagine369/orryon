#!/usr/bin/env node
/**
 * On-device QA checklist for Smart Ambient Pickup.
 * Run before release sign-off on real hardware (cannot be automated in CI).
 *
 * Usage: npm run test:ambient:device-qa
 */

const CHECKLIST = [
  {
    platform: "iOS Safari (PWA or browser)",
    steps: [
      "Settings → Ambient Pickup → toggle on → tap Allow on motion prompt",
      "Return to Home without tapping screen → pick up phone → wake SFX/haptics/avatar",
      "Set phone down while idle → ambient sleeps within ~75s",
      "Premium: start voice → set phone down → mini-orb stays visible",
      "Revoke motion in Safari site settings → reopen app → banner offers re-enable",
    ],
  },
  {
    platform: "Android Chrome",
    steps: [
      "Enable Ambient Pickup in settings",
      "Pick up from table without touching screen → wake triggers",
      "Put down during active chat → mini-orb (Premium + voice) or sleep (Free)",
    ],
  },
  {
    platform: "Capacitor native (iOS + Android)",
    steps: [
      "npm run cap:sync → run from Xcode / Android Studio",
      "Verify wake haptics (native path, not navigator.vibrate)",
      "Verify accelerometer via @capacitor/motion (no iOS web permission prompt)",
      "Background app → sensors pause → foreground → pickup still works",
    ],
  },
];

console.log("\nAmbient Pickup — On-Device QA Checklist\n");
console.log("Automated Playwright tests cover settings UI and overlay rendering.");
console.log("Complete this checklist on physical devices before production sign-off.\n");

for (const section of CHECKLIST) {
  console.log(`## ${section.platform}`);
  section.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. [ ] ${step}`);
  });
  console.log("");
}

console.log("Record results in your release notes or QA ticket.\n");
