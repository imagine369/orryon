"use client";

import { useEffect } from "react";
import { warmConnection, connectChatWs, disconnectChatWs } from "@/lib/chat-transport";

/** Warm HTTP connection and prefer WebSocket; SSE is used only when WS is unavailable. */
export function useChatTransport(): void {
  useEffect(() => {
    warmConnection();
    connectChatWs();
    return () => disconnectChatWs();
  }, []);
}
