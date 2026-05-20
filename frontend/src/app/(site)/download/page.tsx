import { DownloadPageClient } from "@/components/download-page-client";
import { SiteNav, SignInNavLink } from "@/components/site-nav";

export default function DownloadPage() {
  return (
    <div className="flex flex-col flex-1 bg-black text-white">
      <SiteNav>
        <SignInNavLink />
      </SiteNav>
      <DownloadPageClient />
    </div>
  );
}
