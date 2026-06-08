"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";

interface MemoryFact { id: string; fact: string; category: string; created_at: string; }

export function MemoryView() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ facts: MemoryFact[]; count: number; cap: number }>("/api/memory")
      .then((d) => { setFacts(d.facts); setCount(d.count); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const forget = async (id: string) => {
    setFacts((p) => p.filter((f) => f.id !== id));
    setCount((c) => c - 1);
    try { await api.delete(`/api/memory/${id}`); } catch { /* non-fatal */ }
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/50" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/35 leading-relaxed">
        Orryon remembers facts about you across conversations to give personalised advice.
        You can remove any fact at any time.
      </p>
      <div className="flex items-center justify-between text-xs text-white/30">
        <span>{count} facts stored</span>
        {count >= 50 && <span className="text-amber-400/70">Starter cap: 50 facts</span>}
      </div>
      {facts.length === 0 && (
        <p className="py-6 text-center text-sm text-white/20">No memories stored yet.</p>
      )}
      {facts.map((f) => (
        <div key={f.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/70 leading-relaxed">{f.fact}</p>
            <p className="text-[0.65rem] text-white/25 mt-1 uppercase tracking-wide">{f.category}</p>
          </div>
          <button
            onClick={() => forget(f.id)}
            className="shrink-0 w-11 h-11 flex items-center justify-center text-white/20 hover:text-red-400/70 transition"
            title="Forget this"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}
