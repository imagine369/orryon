import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  chatHistoryPath,
  chatSessionDeletePath,
  chatSessionsListPath,
} from "./chat-session-api.ts";

describe("chat session API paths (useChatSessions)", () => {
  it("lists sessions", () => {
    assert.equal(chatSessionsListPath(), "/api/chat/sessions");
  });

  it("builds history URL with encoded session id", () => {
    assert.equal(
      chatHistoryPath("sess/with space"),
      "/api/chat/history?session_id=sess%2Fwith%20space&limit=100",
    );
    assert.equal(chatHistoryPath("abc", 50), "/api/chat/history?session_id=abc&limit=50");
  });

  it("builds delete URL", () => {
    assert.equal(chatSessionDeletePath("id-1"), "/api/chat/sessions/id-1");
  });
});
