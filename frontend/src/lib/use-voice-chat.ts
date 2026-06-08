"use client";

import { useCallback, useEffect, useState } from "react";
import type { VoiceStatus } from "@/components/chat-input";
import { VoiceLimitError } from "@/lib/voice";

export function useVoiceChat() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{
    minutesUsed: number;
    limitMinutes: number;
  } | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3200);
    return () => clearTimeout(t);
  }, [error]);

  const handleError = useCallback((errOrMsg: string | Error) => {
    if (errOrMsg instanceof VoiceLimitError) {
      setLimitInfo({
        minutesUsed: errOrMsg.minutesUsed,
        limitMinutes: errOrMsg.limitMinutes,
      });
      setLimitOpen(true);
      return;
    }
    setError(typeof errOrMsg === "string" ? errOrMsg : errOrMsg.message);
  }, []);

  return {
    status,
    setStatus,
    error,
    limitOpen,
    setLimitOpen,
    limitInfo,
    handleError,
  };
}
