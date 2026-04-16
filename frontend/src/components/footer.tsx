import Link from "next/link";

export function Footer() {
  return (
    <footer className="flex items-center justify-between px-5 py-3 border-t border-white/5 shrink-0">
      <div className="flex items-center gap-4">
        <Link href="/privacy" className="text-[0.65rem] text-white/25 hover:text-white/50 transition">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-[0.65rem] text-white/25 hover:text-white/50 transition">
          Terms of Use
        </Link>
        <Link href="/contact" className="text-[0.65rem] text-white/25 hover:text-white/50 transition">
          Contact
        </Link>
      </div>
      <p className="text-[0.65rem] text-white/15">© 2026 Orryon</p>
    </footer>
  );
}
