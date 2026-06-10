"use client";

import { Share, Plus, MoreVertical } from "lucide-react";

function InstructionBlock({
  title,
  large,
  children,
  className,
}: {
  title: string;
  large?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        large
          ? `rounded-2xl border border-white/15 bg-[#141414] p-5 space-y-5 text-left ${className ?? ""}`
          : `rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 text-left ${className ?? ""}`
      }
    >
      <p
        className={
          large
            ? "text-sm text-white/70 font-semibold uppercase tracking-wider"
            : "text-xs text-white/45 font-medium uppercase tracking-wider"
        }
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function Step({
  step,
  icon,
  title,
  detail,
  large,
}: {
  step: number;
  icon?: React.ReactNode;
  title: string;
  detail: string;
  large?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={
          large
            ? "w-10 h-10 rounded-full bg-white/12 flex items-center justify-center shrink-0 text-sm font-bold text-white/80"
            : "w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-semibold text-white/50"
        }
      >
        {icon ?? step}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className={large ? "text-base font-medium text-white leading-snug" : "text-[13px] text-white/80"}>
          {title}
        </p>
        <p
          className={
            large
              ? "text-sm text-white/55 mt-1.5 leading-relaxed"
              : "text-[11px] text-white/35 mt-0.5 leading-relaxed"
          }
        >
          {detail}
        </p>
      </div>
    </div>
  );
}

export function IosInstallInstructions({
  large = false,
  /** Reference-only steps in the install modal — not tappable controls. */
  referenceOnly = false,
}: { large?: boolean; referenceOnly?: boolean } = {}) {
  const iconSize = large ? "h-4 w-4" : "h-3 w-3";
  return (
    <InstructionBlock
      title={referenceOnly ? "Then in the share sheet" : "In Safari"}
      large={large}
      className={referenceOnly ? "pointer-events-none select-none opacity-90" : undefined}
    >
      {referenceOnly ? (
        <>
          <Step
            large={large}
            step={1}
            icon={<Plus className={`${iconSize} text-white/70`} strokeWidth={1.5} />}
            title='Choose "Add to Home Screen"'
            detail="Scroll down in the share sheet if you don't see it"
          />
          <Step
            large={large}
            step={2}
            title='Tap "Add" in the top-right'
            detail="Then open Orryon from your home screen"
          />
        </>
      ) : (
        <>
          <Step
            large={large}
            step={1}
            icon={<Share className={`${iconSize} text-white/70`} strokeWidth={1.5} />}
            title='Tap Share (□↑) at the bottom of Safari'
            detail="Look at Safari's bottom toolbar — not inside this popup"
          />
          <Step
            large={large}
            step={2}
            icon={<Plus className={`${iconSize} text-white/70`} strokeWidth={1.5} />}
            title='Tap "Add to Home Screen"'
            detail="Scroll down in the share sheet if you don't see it"
          />
          <Step
            large={large}
            step={3}
            title='Tap "Add" in the top-right'
            detail="Then open Orryon from your home screen"
          />
        </>
      )}
    </InstructionBlock>
  );
}

export function AndroidInstallInstructions() {
  return (
    <InstructionBlock title="Install on Android">
      <Step step={1} icon={<MoreVertical className="h-3 w-3 text-white/50" strokeWidth={1.5} />} title="Tap the menu (⋮)" detail="In Chrome's top-right corner" />
      <Step step={2} icon={<Plus className="h-3 w-3 text-white/50" strokeWidth={1.5} />} title='Tap "Install app"' detail='Or "Add to Home screen" depending on your browser' />
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
      {steps.map((s, i) => (
        <Step key={s.title} step={i + 1} title={s.title} detail={s.detail} />
      ))}
    </InstructionBlock>
  );
}
