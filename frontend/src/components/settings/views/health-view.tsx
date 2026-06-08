"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { api } from "@/lib/api";

interface Medication { id: string; name: string; dose: string; frequency: string; next_dose_at: string; }
interface Appointment { id: string; type: string; provider: string; date: string; location: string; }

export function HealthView() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [addingMed, setAddingMed] = useState(false);
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");

  useEffect(() => {
    api.get<{ medications: Medication[] }>("/api/health/medications").then((d) => setMeds(d.medications)).catch(() => {});
    api.get<{ appointments: Appointment[] }>("/api/health/appointments?upcoming=true").then((d) => setAppts(d.appointments)).catch(() => {});
  }, []);

  const addMed = async () => {
    if (!medName.trim()) return;
    try {
      const row = await api.post<Medication>("/api/health/medications", { name: medName.trim(), dose: medDose.trim() });
      setMeds((p) => [...p, row]);
      setMedName(""); setMedDose(""); setAddingMed(false);
    } catch { /* non-fatal */ }
  };

  const removeMed = async (id: string) => {
    setMeds((p) => p.filter((m) => m.id !== id));
    try { await api.delete(`/api/health/medications/${id}`); } catch { /* non-fatal */ }
  };

  return (
    <div className="space-y-5">
      {/* Medications */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Medications</p>
          <button onClick={() => setAddingMed((v) => !v)} className="text-white/30 hover:text-white/60 transition">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        {addingMed && (
          <div className="mb-3 space-y-2 rounded-xl border border-white/[0.07] p-3">
            <input autoFocus value={medName} onChange={(e) => setMedName(e.target.value)}
              placeholder="Medication name" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
            <input value={medDose} onChange={(e) => setMedDose(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMed()}
              placeholder="Dose (e.g. 10mg daily)" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
            <div className="flex gap-2 pt-1">
              <button onClick={addMed} className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg">Save</button>
              <button onClick={() => setAddingMed(false)} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 transition">Cancel</button>
            </div>
          </div>
        )}
        {meds.length === 0 && !addingMed && <p className="text-sm text-white/20 py-3">No medications added.</p>}
        {meds.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04]">
            <div className="flex-1">
              <p className="text-sm text-white/75">{m.name}</p>
              {m.dose && <p className="text-xs text-white/30 mt-0.5">{m.dose}</p>}
            </div>
            <button onClick={() => removeMed(m.id)} className="w-11 h-11 flex items-center justify-center text-white/15 hover:text-red-400/70 transition">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {/* Upcoming appointments */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Upcoming Appointments</p>
        {appts.length === 0 && <p className="text-sm text-white/20">No upcoming appointments.</p>}
        {appts.map((a) => (
          <div key={a.id} className="py-2.5 border-b border-white/[0.04]">
            <p className="text-sm text-white/75">{a.provider || a.type || "Appointment"}</p>
            <p className="text-xs text-white/30 mt-0.5">{a.date}{a.location ? ` · ${a.location}` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
