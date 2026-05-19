"use client";

import { useRouter } from "next/navigation";

/** Right-side nav control for secondary pages (privacy, terms, contact). */
export function NavBackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 hover:text-white hover:border-white/25 active:scale-[0.98] transition"
    >
      &larr; {label}
    </button>
  );
}
