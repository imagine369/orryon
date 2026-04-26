/**
 * Breathing module — public surface.
 *
 * STRICT separation rule: nothing in this folder may import from
 * `@/lib/subscription-service`, `@/lib/use-subscription`, or
 * `@/components/subscription/*`. Breathing is free, fully local, and
 * must remain functional even if the subscription module is deleted
 * outright.
 *
 * If a caller needs an upgrade nudge after a session, pass it via
 * `<BreathingWidget doneFooterSlot={...}>`. Breathing renders the slot
 * verbatim and never inspects it.
 */

export { BreathingWidget } from "./breathing-widget";
export type { BreathingWidgetProps } from "./breathing-widget";
