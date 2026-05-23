import { Check, Sparkles, Wind, Zap, type LucideIcon } from "lucide-react";
import { RESET_ANCHORS } from "@/lib/reset-scripts";
import type { TierId } from "@/lib/tier-checkout";

export type Billing = "monthly" | "annual";

export type TierDefinition = {
  id: TierId | "starter";
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualTotal: number;
  annualMonthly: number;
  icon: LucideIcon;
  iconColor: string;
  accentBg: string;
  accentBorder: string;
  popular: boolean;
  cta: string;
  features: readonly string[];
};

const STARTER_FEATURES = [
  "Guided breathing sessions",
  ...RESET_ANCHORS.map((a) => a.title),
  "Breathe orb (always free)",
] as const;

export const PRICING_TIERS: readonly TierDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Guided breathing. Forever free.",
    monthlyPrice: 0,
    annualTotal: 0,
    annualMonthly: 0,
    icon: Wind,
    iconColor: "text-teal-400",
    accentBg: "rgba(20,184,166,0.08)",
    accentBorder: "rgba(20,184,166,0.18)",
    popular: false,
    cta: "Start for free",
    features: STARTER_FEATURES,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "All-in-One Life Concierge",
    monthlyPrice: 22,
    annualTotal: 198,
    annualMonthly: 16.5,
    icon: Sparkles,
    iconColor: "text-purple-400",
    accentBg: "rgba(168,85,247,0.08)",
    accentBorder: "rgba(168,85,247,0.20)",
    popular: true,
    cta: "Start 14-day trial",
    features: [
      "Personal AI concierge — full Life OS chat (text)",
      "Budget tracking & spending insights",
      "Health vitals, medications & appointments",
      "Location intelligence & commute awareness",
      "Daily morning briefing",
      "Email bill detection",
      "Calendar, tasks & reminders",
      "Cash flow forecast",
      "3,000 chat messages / month",
      "Full data export",
      "Heavy usage handling: Hard limits + upgrade prompts",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Talk to Orryon — voice in, text replies.",
    monthlyPrice: 33,
    annualTotal: 297,
    annualMonthly: 24.75,
    icon: Zap,
    iconColor: "text-amber-400",
    accentBg: "rgba(251,191,36,0.06)",
    accentBorder: "rgba(251,191,36,0.18)",
    popular: false,
    cta: "Get Premium",
    features: [
      "Everything in Pro",
      "Unlimited chat messages (subject to Fair Usage Policy)",
      "Everything in Pro",
      "Speak in — mic in chat",
      "650 speak-in minutes / month",
      "Long-term memory (persistent context)",
      "Proactive suggestions & smart briefings",
      "Golden Mode (easy-read UI)",
      "Priority AI processing",
      "Heavy usage handling: Upgrade prompts near limits",
    ],
  },
  {
    id: "premium_plus",
    name: "Premium Plus",
    tagline: "Hear Orryon speak — maximum voice, full power.",
    monthlyPrice: 49,
    annualTotal: 441,
    annualMonthly: 36.75,
    icon: Zap,
    iconColor: "text-sky-400",
    accentBg: "rgba(56,189,248,0.06)",
    accentBorder: "rgba(56,189,248,0.18)",
    popular: false,
    cta: "Get Premium Plus",
    features: [
      "Everything in Premium",
      "Orryon speaks replies aloud (toggle on/off)",
      "1,200 voice minutes / month (speak-in + spoken replies)",
      "Approval gate for sensitive actions",
      "Dedicated priority support",
      "Early access to new features",
      "Voice in chat: priority processing",
      "Heavy usage handling: Progressive slowdown + notice",
    ],
  },
];

export const PAID_PRICING_TIERS = PRICING_TIERS.filter((t) => t.id !== "starter");

export const UPGRADE_PATH = "/upgrade";
