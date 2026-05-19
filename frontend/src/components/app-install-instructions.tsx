"use client";

import { Share, Plus, MoreVertical } from "lucide-react";

function InstructionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 text-left">
      <p className="text-xs text-white/45 font-medium uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Step({
  icon,
  title,
  detail,
}: {
  icon?: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
        {icon ?? <span className="text-[10px] text-white/40">•</span>}
      </div>
      <div>
        <p className="text-[13px] text-white/70">{title}</p>
        <p className="text-[11px] text-white/30 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

export function IosInstallInstructions() {
  return (
    <InstructionBlock title="Install on iPhone & iPad">
      <Step icon={<Share className="h-3 w-3 text-white/50" strokeWidth={1.5} />} title='Tap "Share"' detail="In Safari's bottom toolbar" />
      <Step icon={<Plus className="h-3 w-3 text-white/50" strokeWidth={1.5} />} title='Tap "Add to Home Screen"' detail="Scroll down in the share menu if needed" />
    </InstructionBlock>
  );
}

export function AndroidInstallInstructions() {
  return (
    <InstructionBlock title="Install on Android">
      <Step icon={<MoreVertical className="h-3 w-3 text-white/50" strokeWidth={1.5} />} title="Tap the menu (⋮)" detail="In Chrome's top-right corner" />
      <Step icon={<Plus className="h-3 w-3 text-white/50" strokeWidth={1.5} />} title='Tap "Install app"' detail='Or "Add to Home screen" depending on your browser' />
    </InstructionBlock>
  );
}

export function DesktopInstallInstructions({ platform }: { platform: "mac" | "windows" | "linux" }) {
  const title =
    platform === "mac" ? "After downloading for Mac" : platform === "windows" ? "After downloading for Windows" : "After downloading for Linux";

  const steps =
    platform === "mac"
      ? [
          { title: "Open the .dmg file", detail: "From your Downloads folder" },
          { title: "Drag Orryon to Applications", detail: "The Orryon avatar icon appears in the installer" },
          { title: "Open Orryon from Applications", detail: "You'll see the avatar in your Dock" },
        ]
      : platform === "windows"
        ? [
            { title: "Run the installer", detail: "From your Downloads folder" },
            { title: "Follow the setup prompts", detail: "Approve if Windows SmartScreen asks" },
            { title: "Open Orryon from the Start menu", detail: "Look for the Orryon avatar icon" },
          ]
        : [
            { title: "Make the AppImage executable", detail: "chmod +x Orryon-linux.AppImage" },
            { title: "Run the AppImage", detail: "./Orryon-linux.AppImage" },
            { title: "Pin to your launcher", detail: "Optional — depends on your desktop environment" },
          ];

  return (
    <InstructionBlock title={title}>
      {steps.map((s) => (
        <Step key={s.title} title={s.title} detail={s.detail} />
      ))}
    </InstructionBlock>
  );
}
