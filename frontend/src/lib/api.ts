/**
 * Public API client — re-exports REST helpers and chat streaming transport.
 */
export {
  getApiBase,
  setToken,
  clearToken,
  hasToken,
  hasAuthSignal,
  isDemoMode,
  getCsrfToken,
  clientHeaders,
  parseApiDetail,
  api,
} from "@/lib/api-client";

export {
  type PlanLimitDetail,
  type ChatEvent,
  PlanLimitError,
  warmConnection,
  streamChat,
  connectChatWs,
  disconnectChatWs,
  streamChatAuto,
} from "@/lib/api-chat";
