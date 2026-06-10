import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IntegrityGate } from "@/components/integrity-gate";
import { ScrollToTopOnNavigate } from "@/components/scroll-to-top-on-navigate";
import { PwaRegister } from "@/components/pwa-register";
import { SwBuildSync } from "@/components/sw-build-sync";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });

const META_DESCRIPTION =
  "Orryon is your Life OS — ask almost anything in chat; when it's about your money, schedule, and notes, Orryon actually does something.";

export const metadata: Metadata = {
  title: "orryon",
  description: META_DESCRIPTION,
  manifest: "/manifest.json",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://orryon.vercel.app"),
  openGraph: {
    title: "orryon — Your Life OS",
    description: META_DESCRIPTION,
    url: "/",
    siteName: "orryon",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "orryon — Your Life OS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "orryon — Your Life OS",
    description: META_DESCRIPTION,
    images: ["/og-image.png"],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "orryon" },
  icons: {
    icon: [
      { url: "/avatar.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Opt the entire tree into dynamic rendering so `src/proxy.ts` can inject a
  // fresh per-request CSP nonce and Next.js attaches it to every <script> it
  // emits. Without this the statically pre-rendered chunks would be blocked
  // by `'strict-dynamic'` (which ignores `'self'`).
  await headers();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-black text-white">
        <IntegrityGate>
          <AuthProvider>
            <ErrorBoundary>
              <TooltipProvider>
                <SwBuildSync />
                <PwaRegister />
                <ScrollToTopOnNavigate />
                {children}
              </TooltipProvider>
            </ErrorBoundary>
          </AuthProvider>
        </IntegrityGate>
      </body>
    </html>
  );
}
