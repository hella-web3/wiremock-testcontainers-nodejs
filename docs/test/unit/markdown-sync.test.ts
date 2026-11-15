import { describe, expect, it } from "vitest";
import { SYNCED_MARKDOWN, syncMarkdown } from "../../src/lib/markdown-sync.mts";

const read = (ref: string): string => `// ${ref}\nconst x = 1;`;

describe("syncMarkdown()", () => {
  it("rewrites the block after each marker, keeping the fence and everything else", () => {
    const text = "# Title\n\n<!-- snippet: a.ts#one -->\n```typescript\nold\ncode\n```\n\ntext\n\n<!-- snippet: b.ts -->\n~~~ts\n~~~\n";
    expect(syncMarkdown(text, read)).toEqual({
      text: "# Title\n\n<!-- snippet: a.ts#one -->\n```typescript\n// a.ts#one\nconst x = 1;\n```\n\ntext\n\n<!-- snippet: b.ts -->\n~~~ts\n// b.ts\nconst x = 1;\n~~~\n",
      refs: ["a.ts#one", "b.ts"],
    });
  });

  it("is idempotent", () => {
    const { text } = syncMarkdown("<!-- snippet: a.ts -->\n```ts\n```", read);
    expect(syncMarkdown(text, read).text).toBe(text);
  });

  it("closes a block only with its own fence", () => {
    const text = "<!-- snippet: a.ts -->\n````md\n```ts\n```\n````";
    expect(syncMarkdown(text, read).text).toBe("<!-- snippet: a.ts -->\n````md\n// a.ts\nconst x = 1;\n````");
  });

  it("rejects a marker without a code block, or an unclosed one", () => {
    expect(() => syncMarkdown("<!-- snippet: a.ts -->\ntext", read, "README.md")).toThrow(
      'README.md:1: the snippet marker for "a.ts" must be followed by a code fence',
    );
    expect(() => syncMarkdown("x\n<!-- snippet: a.ts -->", read)).toThrow("document:2: the snippet marker");
    expect(() => syncMarkdown("<!-- snippet: a.ts -->\n```ts\ncode", read)).toThrow('document:2: the code fence after the snippet marker for "a.ts" is never closed');
  });

  it("syncs the root README – shown on GitHub and npm", () => {
    expect(SYNCED_MARKDOWN).toEqual(["README.md"]);
  });
});
