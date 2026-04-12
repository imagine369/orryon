"use client";

import { useRef, useState } from "react";
import { Camera, X, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

interface ReceiptData {
  merchant: string | null;
  amount: number | null;
  date: string | null;
  category: string | null;
  items: string[] | null;
}

const CATEGORIES = [
  "Food & Dining", "Groceries", "Transport", "Entertainment",
  "Shopping", "Health & Fitness", "Utilities", "Travel",
  "Subscriptions", "Personal Care", "Education", "Other",
];

interface ReceiptScannerProps {
  onSaved: () => void;
}

export function ReceiptScanner({ onSaved }: ReceiptScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("Other");

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    setScanning(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("orryon_token");
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/receipts/scan`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error("Scan failed");
      const data: ReceiptData = await res.json();

      setResult(data);
      setMerchant(data.merchant || "");
      setAmount(data.amount !== null ? String(data.amount) : "");
      setDate(data.date || new Date().toISOString().split("T")[0]);
      setCategory(data.category || "Other");
    } catch {
      setError("Couldn't read the receipt. Try a clearer photo.");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!merchant || !amount) return;
    setSaving(true);
    try {
      await api.post("/api/transactions", {
        merchant,
        amount: parseFloat(amount),
        date,
        category,
      });
      onSaved();
      setResult(null);
      setPreview(null);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setResult(null);
    setPreview(null);
    setError(null);
    setScanning(false);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm text-white/60 hover:text-white"
      >
        <Camera className="h-4 w-4" strokeWidth={1.5} />
        <span>Scan Receipt</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Scanning / result modal */}
      <AnimatePresence>
        {(scanning || result || error) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="w-full bg-[#0d0d0d] border-t border-white/5 rounded-t-2xl px-5 pt-5 pb-8"
            >
              {/* Handle */}
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-5" />

              {/* Scanning state */}
              {scanning && (
                <div className="flex flex-col items-center py-8 gap-4">
                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="receipt" className="w-32 h-40 object-cover rounded-lg opacity-40" />
                  )}
                  <Loader2 className="h-6 w-6 text-white/40 animate-spin" strokeWidth={1.5} />
                  <p className="text-sm text-white/40">Reading your receipt…</p>
                </div>
              )}

              {/* Error state */}
              {error && !scanning && (
                <div className="flex flex-col items-center py-6 gap-3">
                  <p className="text-sm text-red-400">{error}</p>
                  <button onClick={reset} className="text-sm text-white/40 hover:text-white transition">Try again</button>
                </div>
              )}

              {/* Result / confirm */}
              {result && !scanning && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-white">Confirm Receipt</p>
                    <button onClick={reset} className="text-white/30 hover:text-white transition">
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>

                  {result.items && result.items.length > 0 && (
                    <div className="mb-4 p-3 bg-white/[0.03] rounded-lg border border-white/5">
                      <p className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1.5">Items detected</p>
                      {result.items.map((item, i) => (
                        <p key={i} className="text-xs text-white/40">{item}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5">
                    <div>
                      <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">Merchant</label>
                      <input
                        value={merchant}
                        onChange={(e) => setMerchant(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">Amount</label>
                        <input
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          type="number"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">Date</label>
                        <input
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          type="date"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <button
                      onClick={handleSave}
                      disabled={saving || !merchant || !amount}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40 mt-1"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Check className="h-4 w-4" strokeWidth={1.5} />}
                      {saving ? "Saving…" : "Save Transaction"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
