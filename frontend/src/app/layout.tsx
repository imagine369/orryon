import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "orryon",
  description: "Your AI personal concierge — budget, goals, schedule, notes, and bills through natural conversation.",
  manifest: "/manifest.json",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://orryon.vercel.app"),
  openGraph: {
    title: "orryon",
    description: "Your AI personal concierge — budget, goals, schedule, notes, and bills through natural conversation.",
    url: "/",
    siteName: "orryon",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "orryon — AI personal concierge" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "orryon",
    description: "Your AI personal concierge — budget, goals, schedule, notes, and bills through natural conversation.",
    images: ["/og-image.png"],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "orryon" },
  icons: {
    icon: [
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-black text-white">
        <AuthProvider>
          <ErrorBoundary>
            <TooltipProvider>{children}</TooltipProvider>
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
