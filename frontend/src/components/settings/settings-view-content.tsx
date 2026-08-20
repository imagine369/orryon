"use client";

import type { SettingsPanel } from "./panel-types";
import { MainMenuView } from "./views/main-menu-view";
import { AccountView } from "./views/account-view";
import { SecurityAccessView } from "./views/security-access-view";
import { SecurityView } from "./views/security-view";
import { SessionsView } from "./views/sessions-view";
import { ConnectedView } from "./views/connected-view";
import { PrivacySafetyView } from "./views/privacy-safety-view";
import { DataView } from "./views/data-view";
import { NotificationsView } from "./views/notifications-view";
import { FinancialView } from "./views/financial-view";
import { SubscriptionView } from "./views/subscription-view";
import { AppView } from "./views/app-view";
import { MemoryView } from "./views/memory-view";
import { HealthView } from "./views/health-view";
import { LocationView } from "./views/location-view";
import { BriefingView } from "./views/briefing-view";
import { AccessibilityView } from "./views/accessibility-view";
import { AmbientView } from "./views/ambient-view";
import { GrokView } from "./views/grok-view";

export function SettingsViewContent({ panel }: { panel: SettingsPanel }) {
  const { view, prefs, updatePrefs, sub } = panel;

  switch (view) {
    case "security-access":
      return <SecurityAccessView panel={panel} />;
    case "security":
      return <SecurityView panel={panel} />;
    case "sessions":
      return <SessionsView panel={panel} />;
    case "connected":
      return <ConnectedView panel={panel} />;
    case "privacy-safety":
      return <PrivacySafetyView panel={panel} />;
    case "data":
      return <DataView panel={panel} />;
    case "notifications":
      return <NotificationsView panel={panel} />;
    case "financial":
      return <FinancialView panel={panel} />;
    case "subscription":
      return <SubscriptionView panel={panel} />;
    case "account":
      return <AccountView panel={panel} />;
    case "app":
      return <AppView />;
    case "memory":
      return <MemoryView />;
    case "health":
      return <HealthView />;
    case "location":
      return <LocationView />;
    case "briefing":
      return <BriefingView prefs={prefs} onUpdate={updatePrefs} />;
    case "accessibility":
      return <AccessibilityView prefs={prefs} onUpdate={updatePrefs} sub={sub} />;
    case "ambient":
      return <AmbientView prefs={prefs} onUpdate={updatePrefs} sub={sub} />;
    case "grok":
      return <GrokView panel={panel} />;
    default:
      return <MainMenuView panel={panel} />;
  }
}
