import { CHAT_CONTAINER } from "@/lib/chat-helpers";

interface UpgradeSuccessBannerProps {
  show: boolean;
  plan?: string | null;
  rounded?: "full" | "xl";
}

export function UpgradeSuccessBanner({
  show,
  plan,
  rounded = "full",
}: UpgradeSuccessBannerProps) {
  if (!show) return null;

  const radius = rounded === "full" ? "rounded-full" : "rounded-xl";
  const message = plan
    ? `Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)}! Your upgrade is active.`
    : "Your upgrade is active. Welcome!";

  return (
    <div className={`${CHAT_CONTAINER} ${rounded === "full" ? "mb-2" : "mt-2"}`}>
      <div
        className={`${radius} border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-center text-sm text-green-400 animate-in fade-in`}
      >
        {message}
      </div>
    </div>
  );
}
