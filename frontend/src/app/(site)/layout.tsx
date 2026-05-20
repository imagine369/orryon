import { Footer } from "@/components/footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-col flex-1 min-h-0">{children}</div>
      <Footer />
    </div>
  );
}
