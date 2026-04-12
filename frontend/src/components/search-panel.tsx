"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, FileText, CreditCard, CheckSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  due_date: string;
  status: string;
}

interface Results {
  transactions: Transaction[];
  notes: Note[];
  tasks: Task[];
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface SearchPanelProps {
  onClose: () => void;
}

export function SearchPanel({ onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ transactions: [], notes: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ transactions: [], notes: [], tasks: [] });
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [transactions, notes, tasks] = await Promise.all([
          api.get<Transaction[]>(`/api/transactions?search=${encodeURIComponent(query)}&limit=5`),
          api.get<Note[]>(`/api/notes?search=${encodeURIComponent(query)}&limit=5`),
          api.get<Task[]>(`/api/tasks?status=open&limit=50`).then((t) =>
            t.filter((tk) => tk.title.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
          ),
        ]);
        setResults({ transactions, notes, tasks });
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  const total = results.transactions.length + results.notes.length + results.tasks.length;
  const hasQuery = query.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="bg-[#0d0d0d] border-b border-white/5 w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <Search className="h-4 w-4 text-white/30 shrink-0" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions, notes, tasks…"
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-white/30 hover:text-white transition">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
          <button onClick={onClose} className="text-white/30 hover:text-white transition text-sm ml-1">
            Cancel
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}

          {!loading && hasQuery && total === 0 && (
            <p className="text-white/30 text-sm text-center py-10">No results for "{query}"</p>
          )}

          {!loading && !hasQuery && (
            <p className="text-white/20 text-sm text-center py-10">Start typing to search…</p>
          )}

          {/* Transactions */}
          {results.transactions.length > 0 && (
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <CreditCard className="h-3 w-3 text-white/25" strokeWidth={1.5} />
                <p className="text-[0.6rem] uppercase tracking-widest text-white/25">Transactions</p>
              </div>
              {results.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-white/5">
                  <div>
                    <p className="text-sm text-white">{t.merchant}</p>
                    <p className="text-[0.65rem] text-white/30">{t.category} · {t.date}</p>
                  </div>
                  <span className="text-sm font-semibold text-white/70">-{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {results.notes.length > 0 && (
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="h-3 w-3 text-white/25" strokeWidth={1.5} />
                <p className="text-[0.6rem] uppercase tracking-widest text-white/25">Notes</p>
              </div>
              {results.notes.map((n) => (
                <div key={n.id} className="py-2.5 border-b border-white/5">
                  <p className="text-sm text-white">{n.title}</p>
                  {n.content && (
                    <p className="text-[0.72rem] text-white/30 truncate mt-0.5">{n.content.split("\n")[0]}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tasks */}
          {results.tasks.length > 0 && (
            <div className="px-4 pt-4 pb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckSquare className="h-3 w-3 text-white/25" strokeWidth={1.5} />
                <p className="text-[0.6rem] uppercase tracking-widest text-white/25">Tasks</p>
              </div>
              {results.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 py-2.5 border-b border-white/5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === "high" ? "bg-red-400" : t.priority === "medium" ? "bg-yellow-400" : "bg-green-400"}`} />
                  <div>
                    <p className="text-sm text-white">{t.title}</p>
                    {t.due_date && <p className="text-[0.65rem] text-white/30">Due {t.due_date}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
