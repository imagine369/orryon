import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, SquarePen, Volume2, VolumeX } from "lucide-react";

interface ChatHeaderActionsProps {
  showSpeakToggle: boolean;
  voiceOverlayOn: boolean;
  onToggleVoiceOverlay: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  streaming?: boolean;
  plan?: string | null;
  variant?: "empty" | "chat";
}

export function ChatHeaderActions({
  showSpeakToggle,
  voiceOverlayOn,
  onToggleVoiceOverlay,
  onOpenHistory,
  onNewChat,
  streaming = false,
  plan,
  variant = "empty",
}: ChatHeaderActionsProps) {
  const speakBtn = showSpeakToggle ? (
    <button
      onClick={onToggleVoiceOverlay}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] ${voiceOverlayOn ? "text-white/70" : "text-white/25"}`}
      title={voiceOverlayOn ? "Orryon speaks replies" : "Text replies only"}
    >
      {voiceOverlayOn ? (
        <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
      ) : (
        <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.5} />
      )}
    </button>
  ) : null;

  const historyBtn = (
    <button
      onClick={onOpenHistory}
      disabled={streaming}
      className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] disabled:opacity-25"
      title="Chat history"
    >
      <Clock className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
    </button>
  );

  const newChatBtn = (
    <button
      onClick={onNewChat}
      disabled={streaming}
      className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] disabled:opacity-25"
      title="New chat"
    >
      <SquarePen className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
    </button>
  );

  if (variant === "empty") {
    return (
      <>
        {speakBtn}
        {historyBtn}
        {newChatBtn}
      </>
    );
  }

  return (
    <div className="shrink-0 border-b border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-2">
        {plan === "starter" && (
          <Link
            href="/breathe"
            className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-left hover:bg-white/[0.06] active:scale-[0.985] transition-all"
          >
            <div
              className="shrink-0 rounded-full"
              style={{
                width: 28,
                height: 28,
                background:
                  "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
              }}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/70 leading-none mb-0.5">
                Take a breath
              </p>
              <p className="text-[0.7rem] text-white/40 leading-none">
                Breathe, reset, or just be still
              </p>
            </div>
          </Link>
        )}

        <div className="ml-auto flex items-center gap-1">
          {speakBtn}
          {historyBtn}
          {newChatBtn}
        </div>
      </div>
    </div>
  );
}

export function BreathePromoEmpty() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 mt-4 w-full">
      <Link
        href="/breathe"
        className="w-full flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 mb-2 text-left hover:bg-white/[0.06] active:scale-[0.98] transition-all"
      >
        <motion.div
          className="shrink-0 rounded-full"
          style={{
            width: 35,
            height: 35,
            background:
              "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
          }}
          animate={{
            scale: [1, 1.13, 1],
            boxShadow: [
              "0 0 10px rgba(90,163,216,.40), 0 0 4px rgba(90,163,216,.20)",
              "0 0 26px rgba(90,163,216,.72), 0 0 12px rgba(90,163,216,.36)",
              "0 0 10px rgba(90,163,216,.40), 0 0 4px rgba(90,163,216,.20)",
            ],
          }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/70 mb-0.5">Take a breath</p>
          <p className="text-[0.72rem] text-white/38 leading-snug">
            Breathe, reset, or just be still
          </p>
        </div>
        <svg
          className="w-4 h-4 text-white/25 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>
      <p className="text-center text-[0.62rem] uppercase tracking-[2.5px] text-white/25">
        Always free · works offline
      </p>
    </div>
  );
}
