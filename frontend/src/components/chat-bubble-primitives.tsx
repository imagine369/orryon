"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Shared typography foundation for all message text
// ─────────────────────────────────────────────────────────────────────────────
const bubbleTypography =
  "text-[15px] leading-[1.7] break-words [overflow-wrap:anywhere]";

// ─── User bubble ──────────────────────────────────────────────────────────────
// Right-aligned blue/indigo accent pill. Max-width relative to the page-level
// max-w-3xl container. The bottom-right corner is tightened to a near-square
// to signal message direction (outgoing).
export const CHAT_USER_BUBBLE_CLASS = [
  bubbleTypography,
  "max-w-[75%]",
  "rounded-[1.25rem] rounded-br-[0.3rem]",
  // Deep navy-blue fill — clearly an accent without being garish in dark mode
  "bg-[#162440] border border-blue-500/[0.18]",
  "px-[1.125rem] py-[0.75rem]",
  "text-white/90 shadow-sm",
].join(" ");

// ─── Assistant bubble ─────────────────────────────────────────────────────────
// Left-aligned neutral shell. Slightly wider than user bubbles because AI
// responses are usually longer and need the reading room. The bottom-left corner
// is pinched to mirror the user bubble direction convention. The `min-h` prevents
// layout jumps while the streaming / thinking indicators are visible.
export function assistantBubbleClass(isError: boolean) {
  return [
    bubbleTypography,
    "max-w-[82%]",
    "rounded-[1.25rem] rounded-bl-[0.3rem]",
    "bg-[#161616] border",
    "px-[1.125rem] py-[0.875rem]",
    // Minimum height prevents the bubble from collapsing to zero before the
    // first token lands, which causes a jarring layout jump.
    "min-h-[3.75rem]",
    "shadow-sm",
    isError
      ? "border-red-500/[0.15] text-red-400/75"
      : "border-white/[0.07] text-[#e2e2e2]",
  ].join(" ");
}

export const CHAT_ASSISTANT_BUBBLE_CLASS = assistantBubbleClass(false);

// ─── Thinking indicator ───────────────────────────────────────────────────────
// Shown during the initial "thinking" phase before streaming begins.
export function ThinkingIndicator() {
  return (
    <div
      className="flex flex-col gap-2.5 py-0.5"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium tracking-wide text-white/35">
          Thinking
        </span>
        <span className="inline-flex items-center gap-[5px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="chat-thinking-dot inline-block h-[5px] w-[5px] rounded-full bg-white/28"
              style={{ animationDelay: `${i * 0.14}s` }}
            />
          ))}
        </span>
      </div>
      {/* Shimmer bar — subtle progress feel */}
      <div
        className="h-[2px] w-[5rem] overflow-hidden rounded-full bg-white/[0.06]"
        aria-hidden
      >
        <div className="chat-thinking-shimmer h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-white/22 to-transparent" />
      </div>
    </div>
  );
}
