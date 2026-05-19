import Link from "next/link";
import { SiteNav, NavBackLink } from "@/components/site-nav";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <SiteNav>
        <NavBackLink />
      </SiteNav>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="text-[0.65rem] uppercase tracking-widest text-white/20 font-semibold mb-4">
        404
      </p>
      <h1 className="text-2xl font-bold text-white/90 tracking-tight mb-2">
        Page not found
      </h1>
      <p className="text-sm text-white/35 max-w-xs leading-relaxed mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/home"
        className="px-6 py-2.5 text-sm font-medium text-black bg-white rounded-full hover:bg-gray-200 transition"
      >
        Go home
      </Link>
      </div>
    </div>
  );
}
