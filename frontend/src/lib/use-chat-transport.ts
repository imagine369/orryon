"use client";

import { useEffect } from "react";
import { warmConnection, connectChatWs, disconnectChatWs } from "@/lib/api";

/** Warm HTTP connection and open the WebSocket chat transport on mount. */
export function useChatTransport(): void {
  useEffect(() => {
    warmConnection();
    connectChatWs();
    return () => disconnectChatWs();
  }, []);
}
