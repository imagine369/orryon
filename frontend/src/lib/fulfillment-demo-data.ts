/**
 * Sample fulfillment handoffs for "Preview the app" demo mode (localhost + localStorage orryon_demo).
 * Used by Errands tab for marketing screenshots without backend/chat.
 */
import type { FulfillmentHandoff } from "@/lib/fulfillment-types";

const DEMO_NOW = "2026-06-09T18:30:00.000Z";

export const DEMO_FULFILLMENT_HANDOFFS: FulfillmentHandoff[] = [
  {
    id: "demo-handoff-ride",
    type: "ride",
    title: "Uber to Osteria Mozza",
    subtitle: "Home → dinner reservation · 6:40 PM",
    action_label: "Open Uber",
    action_url: "https://m.uber.com/ul/",
    status: "pending",
    created_at: DEMO_NOW,
    metadata: { marketing_demo: true },
  },
  {
    id: "demo-handoff-pharmacy",
    type: "pharmacy",
    title: "CVS pickup — Lisinopril",
    subtitle: "Refill ready · 0.9 mi from Home",
    action_label: "Find pharmacy",
    action_url: "https://www.google.com/maps/search/?api=1&query=CVS+Pharmacy",
    status: "pending",
    created_at: DEMO_NOW,
    metadata: { marketing_demo: true },
  },
  {
    id: "demo-handoff-grocery",
    type: "grocery",
    title: "Grocery run",
    subtitle: "milk, eggs, bread, butter",
    action_label: "Shop on Instacart",
    action_url: "https://www.instacart.com/store/s?k=milk+eggs+bread+butter",
    status: "pending",
    created_at: DEMO_NOW,
    metadata: { marketing_demo: true },
  },
  {
    id: "demo-handoff-delivery",
    type: "delivery",
    title: "Thai Basil",
    subtitle: "Pad thai · deliver to Home · est. 35 min",
    action_label: "Order on DoorDash",
    action_url: "https://www.doordash.com/",
    status: "pending",
    created_at: DEMO_NOW,
    metadata: { marketing_demo: true },
  },
  {
    id: "demo-handoff-reservation",
    type: "reservation",
    title: "Italian near Home",
    subtitle: "Party of 2 · Sat 7:00 PM · OpenTable",
    action_label: "Book on OpenTable",
    action_url: "https://www.opentable.com/",
    status: "pending",
    created_at: DEMO_NOW,
    metadata: { marketing_demo: true },
  },
];
