"use client";

import { useState } from "react";
import Link from "next/link";

type Platform = "mac" | "windows" | "linux";

interface PlatformInfo {
  label: string;
  filename: string;
  icon: string;
}

const platforms: Record<Platform, PlatformInfo> = {
  mac: {
    label: "macOS",
    filename: "Orryon-mac.dmg",
    icon: "",
  },
  windows: {
    label: "Windows",
    filename: "Orryon-win.exe",
    icon: "🪟",
  },
  linux: {
    label: "Linux",
    filename: "Orryon-linux.AppImage",
    icon: "🐧",
  },
};

export default function DownloadPage() {
  const [detectedPlatform] = useState<Platform>(() => {
    if (typeof window === "undefined") return "mac";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "windows";
    if (ua.includes("linux")) return "linux";
    return "mac";
  });
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = (platform: Platform) => {
    // In production this would point to real hosted binaries
    // For now we just trigger a fake download + show success state
    const link = document.createElement("a");
    link.href = `/downloads/${platforms[platform].filename}`;
    link.download = platforms[platform].filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-[520px] text-center">
        {/* Logo / brand */}
        <div className="mb-8">
          <span className="font-[family-name:var(--font-playfair)] text-4xl tracking-[6px] font-bold">
            ORRYON
          </span>
        </div>

        <h1 className="text-[2.25rem] sm:text-5xl font-bold tracking-tight mb-4 font-[family-name:var(--font-playfair)]">
          Get Orryon
        </h1>
        <p className="text-white/60 text-lg mb-12">
          Download the app. Sign in. Your wellbeing, private by design.
        </p>

        {/* Primary detected platform */}
        <div className="mb-8">
          <button
            onClick={() => handleDownload(detectedPlatform)}
            className="group relative inline-flex items-center justify-center rounded-full border border-white bg-white px-12 py-4 text-lg font-medium text-black transition active:scale-[0.985]"
          >
            Download for {platforms[detectedPlatform].label}
          </button>
          <p className="mt-3 text-xs text-white/40 tracking-[2px]">
            DETECTED • {platforms[detectedPlatform].label.toUpperCase()}
          </p>
        </div>

        {/* Other platforms */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {(["mac", "windows", "linux"] as Platform[])
            .filter((p) => p !== detectedPlatform)
            .map((p) => (
              <button
                key={p}
                onClick={() => handleDownload(p)}
                className="rounded-full border border-white/20 px-6 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition"
              >
                {platforms[p].icon} {platforms[p].label}
              </button>
            ))}
        </div>

        {downloaded && (
          <p className="mt-8 text-emerald-400 text-sm tracking-widest">
            DOWNLOAD STARTED — CHECK YOUR DOWNLOADS FOLDER
          </p>
        )}

        {/* Subtle footer */}
        <div className="mt-16 text-[10px] text-white/30 tracking-[3px]">
          FREE FOREVER ON STARTER • UPGRADE ANYTIME INSIDE THE APP
        </div>

        <div className="mt-4">
          <Link
            href="/pricing"
            className="text-xs text-white/40 hover:text-white/70 underline-offset-4 hover:underline transition"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
