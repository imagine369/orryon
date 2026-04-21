"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-white/30 hover:text-white/70 text-sm transition inline-flex items-center gap-1"
    >
      &larr; Back
    </button>
  );
}
