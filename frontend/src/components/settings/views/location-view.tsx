"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, MapPin } from "lucide-react";
import { api } from "@/lib/api";

interface Place { id: string; label: string; address: string; }

export function LocationView() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    api.get<{ places: Place[] }>("/api/location/places").then((d) => setPlaces(d.places)).catch(() => {});
  }, []);

  const addPlace = async () => {
    if (!label.trim()) return;
    try {
      const row = await api.post<Place>("/api/location/places", { label: label.trim(), address: address.trim() });
      setPlaces((p) => [...p, row]);
      setLabel(""); setAddress(""); setAdding(false);
    } catch { /* non-fatal */ }
  };

  const removePlace = async (id: string) => {
    setPlaces((p) => p.filter((pl) => pl.id !== id));
    try { await api.delete(`/api/location/places/${id}`); } catch { /* non-fatal */ }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/35 leading-relaxed">
        Save places Orryon should know about — home, work, gym. No live GPS tracking.
      </p>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Places</p>
        <button onClick={() => setAdding((v) => !v)} className="text-white/30 hover:text-white/60 transition">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      {adding && (
        <div className="space-y-2 rounded-xl border border-white/[0.07] p-3">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Home, Work)" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlace()}
            placeholder="Address (optional)" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
          <div className="flex gap-2 pt-1">
            <button onClick={addPlace} className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg">Save</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 transition">Cancel</button>
          </div>
        </div>
      )}
      {places.length === 0 && !adding && <p className="text-sm text-white/20">No places saved yet.</p>}
      {places.map((pl) => (
        <div key={pl.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04]">
          <MapPin className="h-4 w-4 text-white/25 shrink-0" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-sm text-white/75">{pl.label}</p>
            {pl.address && <p className="text-xs text-white/30 mt-0.5">{pl.address}</p>}
          </div>
          <button onClick={() => removePlace(pl.id)} className="w-11 h-11 flex items-center justify-center text-white/15 hover:text-red-400/70 transition">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}
