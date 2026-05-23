/**
 * Whether to show a specific tool caption in chat (e.g. "Logging expense…").
 * Read-only / lookup tools keep the generic Thinking indicator.
 */
export function shouldShowToolCaption(toolName: string): boolean {
  if (!toolName) return false;
  if (toolName.startsWith("get_")) return false;
  if (toolName.startsWith("search_")) return false;
  if (toolName.startsWith("generate_")) return false;
  if (toolName === "cross_feature_search" || toolName === "compare_periods") return false;
  if (toolName === "get_weather") return false;
  return true;
}
