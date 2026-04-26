/**
 * Subscription module — public surface.
 *
 * Everything that touches paid-feature gating lives here. Nothing inside
 * this folder should be imported by breathing/meditation/wellbeing code.
 *
 * To wire an upgrade nudge after a breathing session:
 *
 *   import { BreathingWidget } from "@/components/breathing";
 *   import { PostBreathingUpgradeCard } from "@/components/subscription";
 *
 *   <BreathingWidget doneFooterSlot={<PostBreathingUpgradeCard />} />
 *
 * Breathing remains unaware of subscription state — it just renders the
 * slot.
 */

export { Paywall } from "./paywall";
export { UpgradeButton, UpgradeBanner } from "./upgrade-button";
export { PostBreathingUpgradeCard } from "./post-breathing-upgrade-card";
export { PaywallGuard } from "./paywall-guard";
