/** Instant fulfillment handoff card (deeplink to partner app — no in-app checkout). */

export type FulfillmentHandoffType =
  | "ride"
  | "delivery"
  | "grocery"
  | "reservation"
  | "pharmacy";

export interface FulfillmentHandoff {
  id: string;
  type: FulfillmentHandoffType;
  title: string;
  subtitle: string;
  action_label: string;
  action_url: string;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export const FULFILLMENT_TYPE_ICONS: Record<FulfillmentHandoffType, string> = {
  ride: "🚗",
  delivery: "🍽",
  grocery: "🛒",
  reservation: "📅",
  pharmacy: "💊",
};
