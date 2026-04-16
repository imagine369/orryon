"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, GripVertical, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import { api } from "@/lib/api";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { cn } from "@/lib/utils";
import { isDemo, DEMO_LISTS, DEMO_ITEMS } from "./demo-data";

// ── Types ────────────────────────────────────────────────────────────────────

interface UserList {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  item_count: number;
}

interface ListItem {
  id: string;
  list_id: string;
  name: string;
  notes: string;
  is_checked: number;
  sort_order: number;
  added_at: string;
}

type ItemSort = "manual" | "name";

// ── Icon & color palettes ────────────────────────────────────────────────────

const COLORS = [
  { hex: "#ffffff", label: "White"  },
  { hex: "#ef4444", label: "Red"    },
  { hex: "#f97316", label: "Orange" },
  { hex: "#eab308", label: "Yellow" },
  { hex: "#22c55e", label: "Green"  },
  { hex: "#3b82f6", label: "Blue"   },
  { hex: "#a855f7", label: "Purple" },
  { hex: "#ec4899", label: "Pink"   },
];

// ── List overview ────────────────────────────────────────────────────────────

function ListsOverview({
  onSelect,
}: {
  onSelect: (list: UserList) => void;
}) {
  const [lists, setLists] = useState<UserList[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#ffffff");
  const [query, setQuery] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (isDemo()) { setLists(DEMO_LISTS); return; }
    api.get<UserList[]>("/api/lists").then(setLists).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const createList = () => {
    const name = newName.trim();
    if (!name) return;
    const optimistic: UserList = {
      id: `tmp-${Date.now()}`, name, icon: "",
      color: newColor, sort_order: lists.length, item_count: 0,
    };
    setLists((prev) => [...prev, optimistic]);
    setNewName(""); setNewColor("#ffffff"); setCreating(false);
    if (isDemo()) return;
    api.post<{ id: string }>("/api/lists", { name, color: newColor })
      .then((res) => setLists((prev) => prev.map((l) => l.id === optimistic.id ? { ...optimistic, id: res.id } : l)))
      .catch(() => setLists((prev) => prev.filter((l) => l.id !== optimistic.id)));
  };

  const deleteList = (id: string) => {
    setLists((prev) => prev.filter((l) => l.id !== id));
    if (isDemo()) return;
    api.delete(`/api/lists/${id}`).catch(load);
  };

  const filtered = query.trim()
    ? lists.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()))
    : lists;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">My Lists</p>
        <button
          onClick={() => { setCreating((v) => !v); setTimeout(() => nameRef.current?.focus(), 50); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition"
        >
          {creating
            ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
            : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
          }
        </button>
      </div>

      {/* Search */}
      <div className="relative my-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25 pointer-events-none" strokeWidth={1.5} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lists…"
          className="w-full bg-white/5 rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:bg-white/[0.07] transition"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 rounded-full bg-white/15 hover:bg-white/25 transition"
          >
            <X className="h-2.5 w-2.5 text-white/60" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Create list form */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white/[0.04] rounded-xl p-3 mb-3 border border-white/8">
              <div className="flex gap-2 mb-3">
                <input
                  ref={nameRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createList()}
                  placeholder="List name…"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
                />
                <button onClick={createList} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition shrink-0">
                  Create
                </button>
              </div>

              {/* Color picker */}
              <p className="text-[0.58rem] uppercase tracking-wide text-white/25 mb-1.5">Color</p>
              <div className="flex gap-1.5">
                {COLORS.map(({ hex }) => (
                  <button
                    key={hex}
                    onClick={() => setNewColor(hex)}
                    style={{ backgroundColor: hex }}
                    className={cn(
                      "w-6 h-6 rounded-full transition ring-offset-[#080808] ring-offset-2",
                      newColor === hex ? "ring-2 ring-white/70" : "opacity-60 hover:opacity-100",
                    )}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lists */}
      {filtered.length === 0 && !creating && (
        <p className="text-white/30 text-sm text-center py-10">
          {query ? `No lists match "${query}"` : "No lists yet. Tap + to create one."}
        </p>
      )}

      {filtered.map((list) => (
        <SwipeToDelete key={list.id} onDelete={() => deleteList(list.id)}>
          <button
            onClick={() => onSelect(list)}
            className="w-full flex items-center gap-3 py-3 border-b border-white/5 active:bg-white/[0.02] transition group"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: list.color === "#ffffff" ? "rgba(255,255,255,0.25)" : list.color }}
            />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-white/85 truncate">{list.name}</p>
              {list.item_count > 0 && (
                <p className="text-[0.65rem] text-white/30 mt-0.5">
                  {list.item_count} {list.item_count === 1 ? "item" : "items"} remaining
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition shrink-0" strokeWidth={1.5} />
          </button>
        </SwipeToDelete>
      ))}
    </div>
  );
}

// ── List detail ──────────────────────────────────────────────────────────────

function ListDetail({
  list,
  onBack,
}: {
  list: UserList;
  onBack: () => void;
}) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [sort, setSort] = useState<ItemSort>("manual");
  const [query, setQuery] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (isDemo()) { setItems(DEMO_ITEMS[list.id] ?? []); return; }
    api.get<ListItem[]>(`/api/lists/${list.id}/items`).then(setItems).catch(() => {});
  }, [list.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    scrollRef.current?.closest("[data-scroll-container]")?.scrollTo({ top: 0 });
  }, []);

  const saveReorder = useCallback((ids: string[]) => {
    if (reorderTimer.current) {
      clearTimeout(reorderTimer.current);
    }
    reorderTimer.current = setTimeout(() => {
      api.post(`/api/lists/${list.id}/reorder`, { ids }).catch(() => {});
    }, 600);
  }, [list.id]);

  const addItem = () => {
    const name = newName.trim();
    if (!name) return;
    const optimistic: ListItem = {
      id: `tmp-${Date.now()}`, list_id: list.id, name, notes: "",
      is_checked: 0, sort_order: items.length, added_at: new Date().toISOString(),
    };
    setItems((prev) => [optimistic, ...prev]);
    setNewName(""); setAdding(false);
    if (isDemo()) return;
    api.post<{ id: string }>(`/api/lists/${list.id}/items`, { name })
      .then((res) => setItems((prev) => prev.map((i) => i.id === optimistic.id ? { ...optimistic, id: res.id } : i)))
      .catch(() => setItems((prev) => prev.filter((i) => i.id !== optimistic.id)));
  };

  const toggleItem = (item: ListItem) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_checked: i.is_checked ? 0 : 1 } : i));
    if (isDemo()) return;
    api.patch(`/api/list-items/${item.id}`, { is_checked: item.is_checked ? 0 : 1 }).catch(load);
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (isDemo()) return;
    api.delete(`/api/list-items/${id}`).catch(load);
  };

  const q = query.trim().toLowerCase();

  const applySort = (arr: ListItem[]) => {
    if (sort === "name") return [...arr].sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  };

  const unchecked = applySort(items.filter((i) => !i.is_checked && (!q || i.name.toLowerCase().includes(q))));
  const checked   = items.filter((i) => i.is_checked && (!q || i.name.toLowerCase().includes(q)));

  return (
    <motion.div
      ref={scrollRef}
      initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: 30, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
    >
      {/* Sticky header — stays visible when content scrolls */}
      <div className="sticky top-0 z-10 bg-[#080808] pb-2 -mx-5 px-5 pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-white/40 hover:text-white/70 transition shrink-0"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: list.color === "#ffffff" ? "rgba(255,255,255,0.25)" : list.color }}
          />
          <p className="text-sm font-semibold text-white/85 flex-1 truncate">{list.name}</p>
          <button
            onClick={() => { setAdding((v) => !v); setTimeout(() => addRef.current?.focus(), 50); }}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-gray-200 transition shrink-0"
          >
            {adding
              ? <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
              : <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
            }
          </button>
        </div>
      </div>

      {/* Sort pills */}
      <div className="flex gap-1 mt-1.5 mb-3">
        {([["manual", "Custom"], ["name", "Name"]] as [ItemSort, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={cn(
              "text-[0.58rem] font-medium px-2 py-0.5 rounded-full border transition",
              sort === key
                ? "bg-white/10 border-white/20 text-white/80"
                : "bg-transparent border-white/8 text-white/25 hover:border-white/20 hover:text-white/50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25 pointer-events-none" strokeWidth={1.5} />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${list.name}…`}
          className="w-full bg-white/5 rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:bg-white/[0.07] transition"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); searchRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 rounded-full bg-white/15 hover:bg-white/25 transition"
          >
            <X className="h-2.5 w-2.5 text-white/60" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Add item form */}
      {adding && (
        <div className="flex gap-2 mb-3">
          <input
            ref={addRef}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="New item…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <button onClick={addItem} className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition">
            Add
          </button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <p className="text-white/30 text-sm text-center py-10">
          Nothing here yet. Tap + to add your first item.
        </p>
      )}

      {/* Unchecked items */}
      {sort === "manual" && !q ? (
        <Reorder.Group
          axis="y"
          values={unchecked}
          onReorder={(newOrder) => {
            setItems((prev) => [...newOrder, ...prev.filter((i) => i.is_checked)]);
            saveReorder(newOrder.map((i) => i.id));
          }}
          className="space-y-0"
        >
          {unchecked.map((item) => (
            <Reorder.Item key={item.id} value={item} className="list-none">
              <div className="flex items-center gap-2 py-3 border-b border-white/5 cursor-grab active:cursor-grabbing">
                <GripVertical className="h-4 w-4 text-white/15 shrink-0" strokeWidth={1.5} />
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleItem(item)}
                  className="shrink-0 w-5 h-5 rounded-full border border-white/25 flex items-center justify-center hover:border-white/60 transition active:scale-90"
                />
                <p className="text-sm text-white/85 flex-1 leading-snug">{item.name}</p>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => deleteItem(item.id)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center text-white/20 hover:text-white/60 transition"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        unchecked.map((item) => (
          <SwipeToDelete key={item.id} onDelete={() => deleteItem(item.id)}>
            <div className="flex items-center gap-3 py-3 border-b border-white/5">
              <button
                onClick={() => toggleItem(item)}
                className="shrink-0 w-5 h-5 rounded-full border border-white/25 flex items-center justify-center hover:border-white/60 transition active:scale-90"
              />
              <p className="text-sm text-white/85 flex-1 leading-snug">{item.name}</p>
            </div>
          </SwipeToDelete>
        ))
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <div className="mt-5">
          <p className="text-[0.6rem] uppercase tracking-widest text-white/15 mb-1">
            Done ({checked.length})
          </p>
          {checked.map((item) => (
            <SwipeToDelete key={item.id} onDelete={() => deleteItem(item.id)}>
              <div className="flex items-center gap-3 py-3 border-b border-white/5">
                <button
                  onClick={() => toggleItem(item)}
                  className="shrink-0 w-5 h-5 rounded-full bg-white/10 border border-white/15 flex items-center justify-center transition active:scale-90"
                >
                  <span className="text-white/40 text-[0.55rem] leading-none">✓</span>
                </button>
                <p className="text-sm text-white/30 flex-1 line-through leading-snug">{item.name}</p>
              </div>
            </SwipeToDelete>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function ListsTab() {
  const [activeList, setActiveList] = useState<UserList | null>(null);

  return (
    <AnimatePresence mode="wait">
      {activeList ? (
        <ListDetail key={activeList.id} list={activeList} onBack={() => setActiveList(null)} />
      ) : (
        <motion.div
          key="overview"
          initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        >
          <ListsOverview onSelect={setActiveList} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
