"use client";

import { useState } from "react";
import { Plus, CreditCard, CheckSquare, ShoppingCart, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const categories = [
  "Food & Dining", "Groceries", "Transport", "Entertainment",
  "Shopping", "Health & Fitness", "Utilities", "Rent & Housing",
  "Travel", "Subscriptions", "Personal Care", "Education", "Other",
];

type Mode = null | "expense" | "task" | "grocery" | "note";

export function QuickAdd({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [taskTitle, setTaskTitle] = useState("");
  const [groceryName, setGroceryName] = useState("");
  const [noteTitle, setNoteTitle] = useState("");

  const reset = () => {
    setMode(null);
    setAmount("");
    setMerchant("");
    setCategory("Food & Dining");
    setTaskTitle("");
    setGroceryName("");
    setNoteTitle("");
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "expense" && merchant && amount) {
        await api.post("/api/transactions", { amount: parseFloat(amount), merchant, category });
      } else if (mode === "task" && taskTitle) {
        await api.post("/api/tasks", { title: taskTitle });
      } else if (mode === "grocery" && groceryName) {
        await api.post("/api/grocery", { name: groceryName });
      } else if (mode === "note" && noteTitle) {
        await api.post("/api/notes", { title: noteTitle });
      }
      onAdded?.();
      close();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const actions = [
    { key: "expense" as Mode, icon: <CreditCard className="h-5 w-5 text-white" strokeWidth={1.5} />, label: "Expense" },
    { key: "task" as Mode, icon: <CheckSquare className="h-5 w-5 text-white" strokeWidth={1.5} />, label: "Task" },
    { key: "grocery" as Mode, icon: <ShoppingCart className="h-5 w-5 text-white" strokeWidth={1.5} />, label: "Grocery" },
    { key: "note" as Mode, icon: <FileText className="h-5 w-5 text-white" strokeWidth={1.5} />, label: "Note" },
  ];

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTimeout(reset, 200); }}>
      <PopoverTrigger className="inline-flex items-center justify-center rounded-full bg-white text-black hover:bg-gray-200 w-10 h-10 transition">
        <Plus className="h-5 w-5" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-[#111] border-white/10 p-4" align="end">
        {!mode ? (
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <button
                key={a.key}
                onClick={() => setMode(a.key)}
                className="flex flex-col items-center gap-1 rounded-xl bg-white/5 hover:bg-white/10 py-4 transition"
              >
                {a.icon}
                <span className="text-xs text-white/60">{a.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white mb-2">
              {mode === "expense" && "Quick Expense"}
              {mode === "task" && "Quick Task"}
              {mode === "grocery" && "Add Item"}
              {mode === "note" && "Quick Note"}
            </p>

            {mode === "expense" && (
              <>
                <Input placeholder="Merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} className="bg-black border-white/10 text-white" />
                <Input placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-black border-white/10 text-white" />
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </>
            )}
            {mode === "task" && (
              <Input placeholder="What needs to be done?" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="bg-black border-white/10 text-white" />
            )}
            {mode === "grocery" && (
              <Input placeholder="Item name" value={groceryName} onChange={(e) => setGroceryName(e.target.value)} className="bg-black border-white/10 text-white" />
            )}
            {mode === "note" && (
              <Input placeholder="Note title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} className="bg-black border-white/10 text-white" />
            )}

            <div className="flex gap-2 pt-1">
              <Button onClick={() => reset()} variant="ghost" className="flex-1 text-white/40">Cancel</Button>
              <Button onClick={submit} disabled={loading} className="flex-1 bg-white text-black hover:bg-gray-200">
                {loading ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
