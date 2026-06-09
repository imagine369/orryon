"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart2,
  BookOpen,
  Calendar,
  Check,
  Map,
  Wind,
} from "lucide-react";
import { AnimatedHeroAvatar } from "@/components/animated-hero-avatar";

const ORBIT_ITEMS = [
  { label: "Money",     sub: "Budgets, bills & goals",   Icon: BarChart2, color: "#60a5fa", glow: "rgba(96,165,250,0.20)"  },
  { label: "Tasks",     sub: "To-dos, lists & errands",  Icon: Check,     color: "#4ade80", glow: "rgba(74,222,128,0.20)"  },
  { label: "Calendar",  sub: "Events & reminders",       Icon: Calendar,  color: "#fb923c", glow: "rgba(251,146,60,0.20)"  },
  { label: "Plans",     sub: "Trips, dinners & pickups", Icon: Map,       color: "#fbbf24", glow: "rgba(251,191,36,0.20)"  },
  { label: "Journal",   sub: "Thoughts & entries",       Icon: BookOpen,  color: "#c084fc", glow: "rgba(192,132,252,0.20)" },
  { label: "Wellbeing", sub: "Breathing & clarity",      Icon: Wind,      color: "#2dd4bf", glow: "rgba(45,212,191,0.20)"  },
];

const ORBIT_R = 220;
const AVATAR_R = 77;  // avatar edge (51.5px) + 25px gap
const CIRCLE_R_ACTIVE = 69;   // active circle edge + 25px gap
const CYCLE_MS = 704;
const TRANS_MS = 0.16;
const LINE_DRAW_MS = 0.16;
const ACTIVE_LINE_LEN = ORBIT_R - AVATAR_R - CIRCLE_R_ACTIVE;
const CON_W = 660, CON_H = 580;
const OCX = CON_W / 2, OCY = CON_H / 2;
const ORBIT_DATA = [-90, -30, 30, 90, 150, 210].map((deg) => {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  return { x: OCX + ORBIT_R * ux, y: OCY + ORBIT_R * uy, ux, uy };
});

export function OrbitSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % ORBIT_ITEMS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="border-b border-white/5">
      <div className="text-center px-4 sm:px-6 pt-[80px] sm:pt-[100px] lg:pt-[122px] pb-8 sm:pb-10">
        <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25]">
          Everything you need to run your day —<br />
          <em>nothing you don&rsquo;t.</em>
        </h2>
      </div>

      {/* Desktop: radial orbit */}
      <div className="hidden sm:flex justify-center pb-16 overflow-x-hidden">
        <div className="relative scale-[0.72] sm:scale-[0.82] lg:scale-100 origin-top" style={{ width: CON_W, height: CON_H, overflow: "visible" }}>

          {/* Connecting lines — from avatar edge to circle edge */}
          <svg className="absolute inset-0" width={CON_W} height={CON_H} style={{ pointerEvents: "none" }}>
            {ORBIT_DATA.map((d, i) => {
              if (active !== i) return null;
              const x1 = OCX + AVATAR_R * d.ux;
              const y1 = OCY + AVATAR_R * d.uy;
              const x2 = d.x - CIRCLE_R_ACTIVE * d.ux;
              const y2 = d.y - CIRCLE_R_ACTIVE * d.uy;
              return (
                <motion.line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={ORBIT_ITEMS[i].color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray={`${ACTIVE_LINE_LEN} ${ACTIVE_LINE_LEN}`}
                  initial={{ strokeDashoffset: ACTIVE_LINE_LEN }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: LINE_DRAW_MS, ease: [0.4, 0, 0.2, 1] }}
                />
              );
            })}
          </svg>

          {/* Center avatar */}
          <div className="absolute z-10" style={{ left: OCX, top: OCY, transform: "translate(-50%, -50%)" }}>
            <AnimatedHeroAvatar size="orbit" />
          </div>

          {/* Orbit nodes */}
          {ORBIT_ITEMS.map((item, i) => {
            const d = ORBIT_DATA[i];
            const isActive = active === i;
            const Icon = item.Icon;
            const sz = isActive ? 80 : 64;
            const iconSz = isActive ? 28 : 22;
            return (
              <div
                key={item.label}
                className="absolute flex flex-col items-center z-10"
                style={{ left: d.x, top: d.y, transform: "translate(-50%, -50%)" }}
              >
                <div style={{
                  width: sz, height: sz, borderRadius: "50%",
                  border: `1.5px solid ${isActive ? item.color : "rgba(255,255,255,0.12)"}`,
                  background: "rgba(255,255,255,0.03)",
                  boxShadow: isActive ? `0 0 36px ${item.glow}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: `all ${TRANS_MS}s cubic-bezier(0.34,1.2,0.64,1)`,
                }}>
                  <Icon style={{ width: iconSz, height: iconSz, color: isActive ? item.color : "rgba(255,255,255,0.25)", transition: `all ${TRANS_MS}s ease` }} strokeWidth={1.5} />
                </div>
                <div className="mt-2.5 text-center" style={{ opacity: isActive ? 1 : 0.3, transition: `opacity ${TRANS_MS}s ease` }}>
                  <p className="text-sm font-semibold text-white/85 leading-tight whitespace-nowrap">{item.label}</p>
                  <p className="text-[0.65rem] text-white/60 whitespace-nowrap">{item.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: animated grid */}
      <div className="sm:hidden px-4 pb-16">
        <div className="flex justify-center mb-8">
          <AnimatedHeroAvatar size="orbitMobile" />
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-[360px] mx-auto">
          {ORBIT_ITEMS.map((item, i) => {
            const isActive = active === i;
            const Icon = item.Icon;
            return (
              <div
                key={item.label}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-[160ms]"
                style={{
                  borderColor: isActive ? item.color : "rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                  border: `1.5px solid ${isActive ? item.color : "rgba(255,255,255,0.1)"}`,
                  background: "transparent",
                  transition: `all ${TRANS_MS}s ease`,
                }}>
                  <Icon style={{ width: 16, height: 16, color: isActive ? item.color : "rgba(255,255,255,0.3)", transition: `color ${TRANS_MS}s ease` }} strokeWidth={1.5} />
                </div>
                <p className="text-[0.75rem] font-semibold text-white/85">{item.label}</p>
                <p className="text-[0.62rem] text-white/60 text-center leading-snug">{item.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
