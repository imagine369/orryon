"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Footer } from "@/components/footer";
import { SiteNav } from "@/components/site-nav";

export default function BreatheLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/breathe&flow=breathe");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <SiteNav logoHref="/" />

      <main className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </main>
      <Footer />
    </div>
  );
}
