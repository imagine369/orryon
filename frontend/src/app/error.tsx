"use client";

import { useEffect } from "react";
import { Footer } from "@/components/footer";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
      <p className="text-[0.65rem] uppercase tracking-widest text-white/20 font-semibold mb-4">
        Something went wrong
      </p>
      <h1 className="text-2xl font-bold text-white/90 tracking-tight mb-2">
        Unexpected error
      </h1>
      <p className="text-sm text-white/35 max-w-xs leading-relaxed mb-8">
        Something broke on our end. Try refreshing, or go back to the home screen.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-6 py-2.5 text-sm font-medium text-white/70 border border-white/10 rounded-full hover:bg-white/5 transition"
        >
          Try again
        </button>
        <a
          href="/home"
          className="px-6 py-2.5 text-sm font-medium text-black bg-white rounded-full hover:bg-gray-200 transition"
        >
          Go home
        </a>
      </div>
      <Footer />
    </div>
  );
}
