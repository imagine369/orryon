"use client";

const bubbleTypography =
  "text-sm leading-relaxed break-words [overflow-wrap:anywhere]";
const bubbleMax =
  "w-fit max-w-[min(100%,28rem)] sm:max-w-[min(100%,32rem)]";

export const CHAT_USER_BUBBLE_CLASS = `${bubbleTypography} ${bubbleMax} rounded-2xl rounded-br-md border border-white/10 bg-white/10 px-4 py-3 text-white shadow-sm`;

export function assistantBubbleClass(isError: boolean) {
  return `self-start ${bubbleTypography} ${bubbleMax} rounded-2xl rounded-bl-md border px-4 py-3 shadow-sm ${
    isError
      ? "border-red-500/25 bg-[#111] text-red-400/90"
      : "border-white/5 bg-[#111] text-gray-200"
  }`;
}

export const CHAT_ASSISTANT_BUBBLE_CLASS = assistantBubbleClass(false);

export function ThinkingIndicator() {
  return (
    <div
      className="flex min-h-[3.25rem] flex-col justify-center gap-2.5"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-medium tracking-wide text-white/55">
          Thinking
        </span>
        <span className="inline-flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="chat-thinking-dot inline-block h-2 w-2 rounded-full bg-white/50"
              style={{ animationDelay: `${i * 0.14}s` }}
            />
          ))}
        </span>
      </div>
      <div
        className="h-0.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-white/[0.07]"
        aria-hidden
      >
        <div className="chat-thinking-shimmer h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>
    </div>
  );
}
