"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Sunrise } from "lucide-react";
import { api } from "@/lib/api";

interface Briefing {
  date: string;
  greeting: string;
  summary: string;
  sections: string[];
  generated_at: string;
}

interface BriefingResponse {
  briefing: Briefing;
  date: string;
  read: boolean;
}

export function DailyBriefingCard() {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<BriefingResponse>("/api/briefing/today")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markRead = async () => {
    if (!data || data.read) return;
    setData((prev) => prev ? { ...prev, read: true } : prev);
    try { await api.post("/api/briefing/mark-read", {}); } catch { /* non-fatal */ }
  };

  const toggle = () => {
    setExpanded((v) => !v);
    if (!expanded) markRead();
  };

  if (loading || !data?.briefing?.summary) return null;

  const isUnread = !data.read;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden"
    >
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className="relative shrink-0">
          <Sunrise className="w-4 h-4 text-white/35" strokeWidth={1.5} />
          {isUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-white/60" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/60 truncate">
            {data.briefing.greeting}
          </p>
          {!expanded && (
            <p className="text-xs text-white/30 truncate mt-0.5">
              {data.briefing.summary}
            </p>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-white/25 shrink-0" strokeWidth={1.5} />
          : <ChevronDown className="w-3.5 h-3.5 text-white/25 shrink-0" strokeWidth={1.5} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] space-y-2">
              {data.briefing.sections.map((s, i) => (
                <p key={i} className="text-xs text-white/45 leading-relaxed">
                  {s}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
