"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Download,
  Monitor,
  Smartphone,
  Share,
  Plus,
  ArrowLeft,
  Check,
  Globe,
  Zap,
  Shield,
  Bell,
} from "lucide-react";
import { FadeIn } from "@/components/motion";
import { Footer } from "@/components/footer";
import { PillLink } from "@/components/pill-cta";
import { usePwaInstall, platformLabel } from "@/lib/use-pwa-install";

type PlatformTab = "pwa" | "ios" | "android" | "desktop";

const FEATURES = [
  { icon: Zap, title: "Instant launch", desc: "Opens in under a second from your home screen" },
  { icon: Shield, title: "Offline-ready", desc: "Core features cached locally for reliability" },
  { icon: Bell, title: "Notifications", desc: "Get alerts for bills, tasks, and goals" },
  { icon: Globe, title: "Always in sync", desc: "Your data stays current across all devices" },
];

export default function DownloadPage() {
  const { isInstallable, isInstalled, isIos, platform, install } = usePwaInstall();
  const label = platformLabel(platform);
  const [activeTab, setActiveTab] = useState<PlatformTab>("pwa");
  const [installTriggered, setInstallTriggered] = useState(false);

  useEffect(() => {
    if (platform === "ios") setActiveTab("ios");
    else if (platform === "android") setActiveTab("android");
    else if (platform === "mac" || platform === "windows" || platform === "linux") setActiveTab("desktop");
  }, [platform]);

  const handleInstall = async () => {
    setInstallTriggered(true);
    await install();
    setTimeout(() => setInstallTriggered(false), 2000);
  };

  const tabs: { key: PlatformTab; label: string; icon: typeof Monitor }[] = [
    { key: "pwa", label: "Web App", icon: Globe },
    { key: "ios", label: "iOS", icon: Smartphone },
    { key: "android", label: "Android", icon: Smartphone },
    { key: "desktop", label: "Desktop", icon: Monitor },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <Link
          href="/"
          className="flex items-center gap-2 text-white/50 hover:text-white transition text-sm"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <Link href="/" className="text-white font-extrabold tracking-widest uppercase text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </Link>
        <div className="w-16" />
      </nav>

      {/* Hero */}
      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-6 pt-16 pb-20">

          <FadeIn className="flex flex-col items-center text-center mb-16">
            <motion.div
              className="mb-6"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3.5, ease: "easeInOut", repeat: Infinity }}
            >
              <Image
                src="/avatar.png"
                alt="Orryon"
                width={88}
                height={88}
                className="rounded-2xl object-cover ring-1 ring-white/[0.08] shadow-2xl"
              />
            </motion.div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
              Download for {label}
            </h1>
            <p className="text-white/40 max-w-md text-[15px] leading-relaxed">
              Your AI concierge, always within reach. Full-screen, home screen icon, no browser chrome.
            </p>

            {isInstalled ? (
              <div className="mt-6 flex items-center gap-2 px-4 py-2.5 rounded-full border border-green-500/20 bg-green-500/10">
                <Check className="h-4 w-4 text-green-400" strokeWidth={2} />
                <span className="text-sm text-green-400 font-medium">Orryon is installed on this device</span>
              </div>
            ) : (isInstallable || isIos) ? (
              <button
                onClick={isIos ? undefined : handleInstall}
                className="mt-6 flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-semibold rounded-full hover:bg-gray-100 transition active:scale-[0.98]"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                {installTriggered ? "Installing…" : `Download for ${label}`}
              </button>
            ) : null}
          </FadeIn>

          {/* Platform tabs */}
          <FadeIn delay={0.1} className="mb-10">
            <div className="flex justify-center">
              <div className="inline-flex rounded-full border border-white/[0.06] bg-white/[0.02] p-1 gap-0.5">
                {tabs.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 ${
                      activeTab === key
                        ? "bg-white/10 text-white/90"
                        : "text-white/30 hover:text-white/55"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Tab content */}
          <FadeIn delay={0.15}>
            <div className="mx-auto max-w-lg">

              {activeTab === "pwa" && (
                <PlatformCard
                  title="Install as Web App"
                  subtitle="Works on all platforms — Chrome, Edge, Safari, Firefox"
                  icon={Globe}
                >
                  <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
                    The fastest way to get Orryon. Installs directly from your browser with no app store needed. 
                    Full-screen, home screen icon, and offline support.
                  </p>
                  {isInstallable && !isInstalled ? (
                    <button
                      onClick={handleInstall}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-gray-100 transition active:scale-[0.98]"
                    >
                      <Download className="h-4 w-4" strokeWidth={2} />
                      {installTriggered ? "Installing…" : "Install Now"}
                    </button>
                  ) : isInstalled ? (
                    <div className="w-full flex items-center justify-center gap-2 py-3.5 border border-green-500/20 bg-green-500/5 text-green-400 text-sm font-medium rounded-xl">
                      <Check className="h-4 w-4" strokeWidth={2} />
                      Already installed
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-white/30 text-center">
                        Open this page in Chrome or Edge to install directly, or follow the manual steps below.
                      </p>
                      <ManualInstallSteps />
                    </div>
                  )}
                </PlatformCard>
              )}

              {activeTab === "ios" && (
                <PlatformCard
                  title="iOS"
                  subtitle="iPhone & iPad"
                  icon={Smartphone}
                >
                  <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
                    Add Orryon to your iPhone or iPad home screen for instant access. 
                    Opens full-screen just like a native app.
                  </p>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4 mb-5">
                    <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Add to Home Screen</p>
                    <Step n={1} icon={Share} title="Open in Safari" desc="Navigate to orryon.vercel.app in Safari" />
                    <Step n={2} icon={Share} title="Tap Share" desc="Tap the share button in Safari's toolbar" />
                    <Step n={3} icon={Plus} title="Add to Home Screen" desc="Scroll down and tap 'Add to Home Screen'" />
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-3">Native App (Coming Soon)</p>
                    <p className="text-[13px] text-white/30 leading-relaxed">
                      A native iOS build via TestFlight is in development. Join the waitlist to be notified.
                    </p>
                    <Link
                      href="/contact"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition"
                    >
                      Join waitlist →
                    </Link>
                  </div>
                </PlatformCard>
              )}

              {activeTab === "android" && (
                <PlatformCard
                  title="Android"
                  subtitle="Phone & Tablet"
                  icon={Smartphone}
                >
                  <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
                    Install Orryon on your Android device for the best experience. 
                    Chrome will prompt you to install automatically.
                  </p>

                  {isInstallable && platform === "android" && !isInstalled ? (
                    <button
                      onClick={handleInstall}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-gray-100 transition active:scale-[0.98] mb-5"
                    >
                      <Download className="h-4 w-4" strokeWidth={2} />
                      Install Now
                    </button>
                  ) : isInstalled ? (
                    <div className="w-full flex items-center justify-center gap-2 py-3.5 border border-green-500/20 bg-green-500/5 text-green-400 text-sm font-medium rounded-xl mb-5">
                      <Check className="h-4 w-4" strokeWidth={2} />
                      Already installed
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4 mb-5">
                      <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Manual Install</p>
                      <Step n={1} icon={Globe} title="Open in Chrome" desc="Navigate to orryon.vercel.app" />
                      <Step n={2} icon={Download} title="Tap Install" desc="Chrome will show an install banner, or tap the menu (⋮) and select 'Install app'" />
                    </div>
                  )}

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-3">Native APK (Coming Soon)</p>
                    <p className="text-[13px] text-white/30 leading-relaxed">
                      A native Android build is in development. Join the waitlist to get early access.
                    </p>
                    <Link
                      href="/contact"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition"
                    >
                      Join waitlist →
                    </Link>
                  </div>
                </PlatformCard>
              )}

              {activeTab === "desktop" && (
                <PlatformCard
                  title="Desktop"
                  subtitle="macOS, Windows, Linux"
                  icon={Monitor}
                >
                  <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
                    Install Orryon as a desktop app via your browser. It gets its own window, 
                    taskbar icon, and runs independently from your browser.
                  </p>

                  {isInstallable && (platform === "desktop" || platform === "mac" || platform === "windows" || platform === "linux") && !isInstalled ? (
                    <button
                      onClick={handleInstall}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-gray-100 transition active:scale-[0.98] mb-5"
                    >
                      <Download className="h-4 w-4" strokeWidth={2} />
                      Download for {label}
                    </button>
                  ) : isInstalled ? (
                    <div className="w-full flex items-center justify-center gap-2 py-3.5 border border-green-500/20 bg-green-500/5 text-green-400 text-sm font-medium rounded-xl mb-5">
                      <Check className="h-4 w-4" strokeWidth={2} />
                      Already installed
                    </div>
                  ) : (
                    <ManualInstallSteps />
                  )}

                  <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-3">Native Desktop App</p>
                    <p className="text-[13px] text-white/30 leading-relaxed">
                      A dedicated Electron / Tauri desktop app is on our roadmap. 
                      The PWA experience is already excellent for daily use.
                    </p>
                  </div>
                </PlatformCard>
              )}

            </div>
          </FadeIn>

          {/* Features grid */}
          <FadeIn delay={0.25} className="mt-20">
            <p className="text-center text-[0.65rem] uppercase tracking-widest text-white/25 font-semibold mb-8">
              Why install?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-start gap-4"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-white/40" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80 mb-1">{title}</p>
                    <p className="text-xs text-white/30 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>

          {/* Bottom CTA */}
          <FadeIn delay={0.3} className="mt-20 text-center">
            <p className="text-xs text-white/20 mb-5">Already have Orryon installed?</p>
            <PillLink href="/home" variant="secondary">
              Open Orryon
            </PillLink>
          </FadeIn>

        </div>
      </div>

      <Footer />
    </div>
  );
}

function PlatformCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Monitor;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center">
          <Icon className="h-5 w-5 text-white/50" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-base font-semibold text-white/90">{title}</p>
          <p className="text-xs text-white/30">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  desc,
}: {
  n: number;
  icon: typeof Share;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] font-bold text-white/40">{n}</span>
      </div>
      <div>
        <p className="text-[13px] text-white/70">{title}</p>
        <p className="text-[11px] text-white/30 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function ManualInstallSteps() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      <p className="text-xs text-white/50 font-medium uppercase tracking-wider">Install Manually</p>
      <Step n={1} icon={Globe} title="Open in Chrome or Edge" desc="Navigate to orryon.vercel.app" />
      <Step n={2} icon={Download} title="Click the install icon" desc="Look for the install icon in the address bar, or go to Menu → Install Orryon" />
    </div>
  );
}
