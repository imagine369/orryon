"use client";

import React from "react";
import { ChevronRight, ExternalLink } from "lucide-react";

// ── Small shared components ──────────────────────────────────────────────────

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-green-500" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`}
      />
    </button>
  );
}

export function Row({ label, sublabel, right }: { label: string; sublabel?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-white/5 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {sublabel && <p className="text-xs text-white/30 mt-0.5">{sublabel}</p>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

export function TextField({
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`w-40 max-w-[50vw] bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 placeholder:text-white/25 text-right ${className}`}
    />
  );
}

export function SelectField({ value, onChange, options }: {
  value: string | number;
  onChange: (v: string) => void;
  options: { label: string; value: string | number }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function NavItem({
  icon,
  title,
  description,
  onClick,
  href,
  external,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span className="text-white/25 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-white/85">{title}</p>
        <p className="text-xs text-white/30 mt-0.5 leading-relaxed">{description}</p>
      </div>
      {external ? (
        <ExternalLink className="h-3.5 w-3.5 text-white/15 shrink-0" strokeWidth={1.5} />
      ) : (
        <ChevronRight className="h-4 w-4 text-white/15 shrink-0" strokeWidth={1.5} />
      )}
    </>
  );

  const cls = "w-full flex items-center gap-4 px-1 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition text-left";

  if (href) {
    return (
      <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={cls}>
      {content}
    </button>
  );
}
