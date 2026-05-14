"use client";

import Link from "next/link";
import Image from "next/image";
import { Footer } from "@/components/footer";

export default function DownloadPage() {
  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <header className="flex items-center justify-between px-6 py-5 max-w-4xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image src="/avatar.png" alt="Orryon" width={28} height={28} className="rounded-full object-cover ring-1 ring-white/10" priority />
          <span className="text-white font-extrabold tracking-widest uppercase text-sm font-[family-name:var(--font-playfair)]">ORRYON</span>
        </Link>
        <Link href="/login" className="text-white/50 text-sm hover:text-white/80 transition-colors">Sign in</Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <Image
          src="/avatar.png"
          alt="Orryon"
          width={88}
          height={88}
          className="rounded-full object-cover ring-1 ring-white/10 mb-8"
        />

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 font-[family-name:var(--font-playfair)]">
          Get Orryon
        </h1>
        <p className="text-white/55 text-lg mb-10 max-w-sm leading-relaxed">
          Orryon runs in your browser — no download needed. Sign in on any device and you&apos;re ready to go.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login?step=email"
            className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Open Orryon →
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-8 py-3.5 text-base text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            View pricing
          </Link>
        </div>

        <p className="mt-8 text-xs text-white/25 tracking-[2px] uppercase">
          Works on Mac · Windows · iPhone · Android · any browser
        </p>
      </main>

      <Footer />
    </div>
  );
}
