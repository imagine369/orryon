import Link from "next/link";
import { siteChromePaddingX } from "@/lib/site-chrome";
import { cn } from "@/lib/utils";

export function Footer() {
  return (
    <footer
      className={cn(
        "flex items-center justify-end py-3 border-t border-white/5 shrink-0",
        siteChromePaddingX,
      )}
    >
        <div className="flex items-center gap-4">
        <a
          href="https://github.com/imagine369/orryon"
          className="text-[0.65rem] text-white/25 hover:text-white/50 transition"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        <Link href="/privacy" className="text-[0.65rem] text-white/25 hover:text-white/50 transition">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-[0.65rem] text-white/25 hover:text-white/50 transition">
          Terms of Use
        </Link>
        <p className="text-[0.65rem] text-white/25">© 2026 Orryon</p>
      </div>
    </footer>
  );
}
