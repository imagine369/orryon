import type { FulfillmentHandoff } from "@/lib/fulfillment-types";

/** Pull handoff cards from chat `done` event actions (additive — safe when absent). */
export function extractFulfillmentHandoffs(actions: unknown): FulfillmentHandoff[] {
  if (!Array.isArray(actions)) return [];
  const out: FulfillmentHandoff[] = [];
  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    const rec = action as Record<string, unknown>;
    if (rec.tool !== "create_fulfillment_handoff") continue;
    const result = rec.result as Record<string, unknown> | undefined;
    const handoffs = result?.handoffs;
    if (!Array.isArray(handoffs)) continue;
    for (const h of handoffs) {
      if (h && typeof h === "object" && typeof (h as FulfillmentHandoff).action_url === "string") {
        out.push(h as FulfillmentHandoff);
      }
    }
  }
  return out;
}
