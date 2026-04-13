"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, Check, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

interface PreviewTransaction {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  category: string;
}

interface CSVPreviewResponse {
  status: "preview" | "needs_mapping";
  count?: number;
  duplicates_removed?: number;
  detected_format?: string;
  transactions?: PreviewTransaction[];
  headers?: string[];
  row_count?: number;
  message?: string;
}

interface CSVConfirmResponse {
  imported: number;
  total_selected: number;
  message: string;
}

type Step = "idle" | "uploading" | "preview" | "needs_mapping" | "mapping_upload" | "confirming" | "done";

interface CSVImportProps {
  onImported: () => void;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CSVImport({ onImported }: CSVImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [transactions, setTransactions] = useState<PreviewTransaction[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<{ format: string; count: number; dupes: number }>({
    format: "",
    count: 0,
    dupes: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CSVConfirmResponse | null>(null);
  const [fileName, setFileName] = useState("");

  // Column mapping state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [mapDate, setMapDate] = useState("");
  const [mapAmount, setMapAmount] = useState("");
  const [mapDescription, setMapDescription] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setTransactions([]);
    setSelected(new Set());
    setMeta({ format: "", count: 0, dupes: 0 });
    setError(null);
    setImportResult(null);
    setFileName("");
    setCsvHeaders([]);
    setCsvRowCount(0);
    setMapDate("");
    setMapAmount("");
    setMapDescription("");
    setPendingFile(null);
  }, []);

  const applyPreview = (res: CSVPreviewResponse) => {
    if (res.transactions) {
      setTransactions(res.transactions);
      setSelected(new Set(res.transactions.map((t) => t.id)));
      setMeta({
        format: res.detected_format ?? "unknown",
        count: res.count ?? res.transactions.length,
        dupes: res.duplicates_removed ?? 0,
      });
      setStep("preview");
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    setPendingFile(file);
    setStep("uploading");

    try {
      const res = await api.upload<CSVPreviewResponse>("/api/import/csv", file);

      if (res.status === "needs_mapping") {
        setCsvHeaders(res.headers ?? []);
        setCsvRowCount(res.row_count ?? 0);
        setMapDate("");
        setMapAmount("");
        setMapDescription("");
        setStep("needs_mapping");
        return;
      }

      if (res.status === "preview") {
        applyPreview(res);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
      setStep("idle");
    }
  };

  const handleMappingSubmit = async () => {
    if (!mapDate || !mapAmount || !pendingFile) return;
    setStep("mapping_upload");
    setError(null);

    try {
      const res = await api.upload<CSVPreviewResponse>(
        "/api/import/csv/mapped",
        pendingFile,
        "file",
        {
          date_column: mapDate,
          amount_column: mapAmount,
          description_column: mapDescription,
        },
      );

      if (res.status === "preview") {
        applyPreview(res);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV with mapping");
      setStep("needs_mapping");
    }
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setStep("confirming");
    try {
      const res = await api.post<CSVConfirmResponse>("/api/import/csv/confirm", {
        transaction_ids: [...selected],
      });
      setImportResult(res);
      setStep("done");
      onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
      setStep("preview");
    }
  };

  const isOpen = step !== "idle";

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm text-white/60 hover:text-white"
      >
        <Upload className="h-4 w-4" strokeWidth={1.5} />
        <span>Import CSV</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <AnimatePresence>
        {isOpen && (
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
              className="w-full max-h-[85vh] bg-[#0d0d0d] border-t border-white/5 rounded-t-2xl flex flex-col"
            >
              <div className="px-5 pt-5 pb-0 shrink-0">
                <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-5" />
              </div>

              {/* Uploading state */}
              {step === "uploading" && (
                <div className="flex flex-col items-center py-12 gap-4 px-5">
                  <FileSpreadsheet className="h-8 w-8 text-white/30" strokeWidth={1.5} />
                  <Loader2 className="h-6 w-6 text-white/40 animate-spin" strokeWidth={1.5} />
                  <p className="text-sm text-white/40">
                    Parsing <span className="text-white/60">{fileName}</span>...
                  </p>
                </div>
              )}

              {/* Needs mapping — column picker */}
              {(step === "needs_mapping" || step === "mapping_upload") && (
                <div className="px-5 pb-8">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500/60" strokeWidth={1.5} />
                      <p className="text-sm font-semibold text-white">Map your columns</p>
                    </div>
                    <button
                      onClick={reset}
                      className="text-white/30 hover:text-white transition"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mb-4">
                    We found {csvRowCount} row{csvRowCount !== 1 ? "s" : ""} in{" "}
                    <span className="text-white/60">{fileName}</span> but couldn&apos;t detect
                    the column layout. Pick which columns hold the date, amount, and description.
                  </p>

                  <div className="flex flex-col gap-3 mb-4">
                    <div>
                      <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">
                        Date column <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={mapDate}
                        onChange={(e) => setMapDate(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                      >
                        <option value="">Select...</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">
                        Amount column <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={mapAmount}
                        onChange={(e) => setMapAmount(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                      >
                        <option value="">Select...</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[0.6rem] uppercase tracking-wide text-white/25 mb-1 block">
                        Description / Merchant column
                      </label>
                      <select
                        value={mapDescription}
                        onChange={(e) => setMapDescription(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                      >
                        <option value="">None (optional)</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

                  <button
                    onClick={handleMappingSubmit}
                    disabled={!mapDate || !mapAmount || step === "mapping_upload"}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-30"
                  >
                    {step === "mapping_upload" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} />
                        Parse with this mapping
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Preview table */}
              {step === "preview" && (
                <>
                  <div className="px-5 pb-3 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-white">Import Preview</p>
                      <button
                        onClick={reset}
                        className="text-white/30 hover:text-white transition"
                      >
                        <X className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-[0.65rem] text-white/30">
                      <span>
                        {meta.count} transaction{meta.count !== 1 ? "s" : ""}
                      </span>
                      {meta.dupes > 0 && (
                        <span>{meta.dupes} duplicate{meta.dupes !== 1 ? "s" : ""} removed</span>
                      )}
                      <span className="capitalize">Format: {meta.format}</span>
                    </div>
                  </div>

                  {/* Select all toggle */}
                  <div className="px-5 pb-2 shrink-0">
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          selected.size === transactions.length
                            ? "bg-white border-white"
                            : "border-white/20 bg-transparent"
                        }`}
                      >
                        {selected.size === transactions.length && (
                          <Check className="h-3 w-3 text-black" strokeWidth={2} />
                        )}
                      </div>
                      {selected.size === transactions.length
                        ? `All ${transactions.length} selected`
                        : `${selected.size} of ${transactions.length} selected`}
                    </button>
                  </div>

                  {/* Transaction list */}
                  <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
                    {transactions.map((t) => {
                      const isSelected = selected.has(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleOne(t.id)}
                          className="w-full flex items-center gap-3 py-2.5 border-b border-white/5 text-left transition-colors hover:bg-white/[0.02]"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? "bg-white border-white"
                                : "border-white/20 bg-transparent"
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-black" strokeWidth={2} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm truncate ${
                                isSelected ? "text-white/80" : "text-white/30"
                              }`}
                            >
                              {t.merchant}
                            </p>
                            <p className="text-[0.65rem] text-white/25">
                              {t.date} &middot; {t.category}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-medium tabular-nums shrink-0 ${
                              isSelected ? "text-white/70" : "text-white/25"
                            }`}
                          >
                            {fmt(t.amount)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Confirm footer */}
                  <div className="px-5 pt-3 pb-8 border-t border-white/5 shrink-0">
                    {error && (
                      <p className="text-red-400 text-xs mb-2">{error}</p>
                    )}
                    <button
                      onClick={handleConfirm}
                      disabled={selected.size === 0}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-30"
                    >
                      <Check className="h-4 w-4" strokeWidth={1.5} />
                      Import {selected.size} Transaction{selected.size !== 1 ? "s" : ""}
                    </button>
                  </div>
                </>
              )}

              {/* Confirming state */}
              {step === "confirming" && (
                <div className="flex flex-col items-center py-12 gap-4 px-5">
                  <Loader2 className="h-6 w-6 text-white/40 animate-spin" strokeWidth={1.5} />
                  <p className="text-sm text-white/40">
                    Importing {selected.size} transaction{selected.size !== 1 ? "s" : ""}...
                  </p>
                </div>
              )}

              {/* Done state */}
              {step === "done" && importResult && (
                <div className="flex flex-col items-center py-12 gap-3 px-5">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-400" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {importResult.imported} transaction{importResult.imported !== 1 ? "s" : ""}{" "}
                    imported
                  </p>
                  <p className="text-xs text-white/40">Your budget has been updated.</p>
                  <button
                    onClick={reset}
                    className="mt-2 px-6 py-2 bg-white/10 text-white text-sm rounded-lg hover:bg-white/15 transition"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
