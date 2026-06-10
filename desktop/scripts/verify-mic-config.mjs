/**
 * Static checks for desktop microphone support (no Electron launch required).
 * Run: node scripts/verify-mic-config.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const failures = [];

const entitlements = read("build/entitlements.mac.plist");
if (!entitlements.includes("com.apple.security.device.audio-input")) {
  failures.push("entitlements.mac.plist missing audio-input entitlement");
}

const pkg = JSON.parse(read("package.json"));
const micDescription = pkg.build?.mac?.extendInfo?.NSMicrophoneUsageDescription;
if (!micDescription || !/microphone/i.test(micDescription)) {
  failures.push("package.json missing NSMicrophoneUsageDescription");
}

const mainJs = read("main.js");
if (!mainJs.includes("askForMediaAccess")) {
  failures.push("main.js missing askForMediaAccess handler");
}
if (!mainJs.includes("audioCapture")) {
  failures.push("main.js missing audioCapture permission");
}

if (failures.length > 0) {
  console.error("Desktop mic configuration check failed:\n");
  for (const f of failures) console.error(`  ✖ ${f}`);
  process.exit(1);
}

console.log("Desktop mic configuration OK:");
console.log("  ✔ audio-input entitlement");
console.log("  ✔ NSMicrophoneUsageDescription");
console.log("  ✔ Electron permission handlers");
