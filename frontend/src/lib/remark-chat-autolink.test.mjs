import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import { remarkChatAutolink } from "./remark-chat-autolink.ts";

function linkUrls(tree) {
  const urls = [];
  visit(tree, "link", (node) => urls.push(node.url));
  return urls;
}

function parseWithAutolink(markdown) {
  const processor = unified().use(remarkParse).use(remarkChatAutolink);
  return processor.runSync(processor.parse(markdown));
}

describe("remarkChatAutolink", () => {
  it("does not link disallowed schemes such as file:", () => {
    const tree = parseWithAutolink("see file:///etc/passwd here");
    assert.deepEqual(linkUrls(tree), []);
  });

  it("links allowed https URLs", () => {
    const tree = parseWithAutolink("visit https://orryon.ai today");
    assert.ok(linkUrls(tree).includes("https://orryon.ai"));
  });
});
