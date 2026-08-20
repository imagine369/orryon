import Link from "next/link";
import { PillLink } from "@/components/pill-cta";
import { GetAppInstallCta, GetAppNavLink } from "@/components/get-app-nav-link";
import { GITHUB_REPO_URL } from "@/lib/github";
import { siteChromePaddingX } from "@/lib/site-chrome";
import { cn } from "@/lib/utils";

export { GetAppInstallCta, GetAppNavLink };

/** Homepage nav shell — shared padding, blur, and ORRYON wordmark. */
export const siteNavClass = cn(
  "sticky top-0 z-50 flex items-center justify-between py-3.5 sm:py-4 bg-black/80 backdrop-blur-xl border-b border-white/5",
  siteChromePaddingX,
);

export const siteNavLogoClass =
  "text-white font-extrabold tracking-widest uppercase text-[0.95rem] sm:text-[1.03rem] font-[family-name:var(--font-playfair)]";

const navPillClass =
  "inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 hover:text-white hover:border-white/25 active:scale-[0.98] transition";

export function SiteNavLogo({
  href,
  className,
}: {
  href?: string;
  className?: string;
}) {
  const mark = <span className={cn(siteNavLogoClass, className)}>ORRYON</span>;

  if (href) {
    return (
      <Link href={href} className="hover:opacity-90 transition-opacity" aria-label="Orryon home">
        {mark}
      </Link>
    );
  }
  return mark;
}

export function SiteNav({
  children,
  logoHref = "/",
  safeArea = false,
  className,
}: {
  children?: React.ReactNode;
  /** Pass `false` for a non-linked wordmark (e.g. landing). */
  logoHref?: string | false;
  safeArea?: boolean;
  className?: string;
}) {
  return (
    <nav
      className={cn(siteNavClass, className)}
      style={
        safeArea
          ? { paddingTop: "max(0.875rem, calc(0.875rem + env(safe-area-inset-top)))" }
          : undefined
      }
    >
      {logoHref === false ? <SiteNavLogo /> : <SiteNavLogo href={logoHref} />}
      {children != null ? <div className="flex items-center gap-3 shrink-0">{children}</div> : null}
    </nav>
  );
}

/** Server-safe back control for legal / static pages. */
export function NavBackLink({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className={navPillClass}>
      &larr; {label}
    </Link>
  );
}

export function GitHubNavLink() {
  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noreferrer"
      className={navPillClass}
    >
      GitHub
    </a>
  );
}

/** Marketing / download pages — sign-in entry. */
export function SignInNavLink() {
  return (
    <PillLink href="/login?step=email" size="sm" variant="secondary">
      Sign in
    </PillLink>
  );
}

