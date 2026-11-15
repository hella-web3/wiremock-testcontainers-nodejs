import { describe, expect, it, vi } from "vitest";
import { MarkdownPageEvent, type MarkdownApplication } from "typedoc-plugin-markdown";
import { descriptionOf, load, withDescription } from "../../src/lib/typedoc-descriptions.mts";

const summary = (...texts: string[]) => ({ summary: texts.map((text) => ({ text })) });

describe("descriptionOf()", () => {
  it.each<[string, unknown, string | undefined]>([
    ["a comment's first paragraph, on one line", { comment: summary("Starts `WireMock`\nin Docker.\n\nMore details.") }, "Starts `WireMock` in Docker."],
    ["the first signature's comment", { signatures: [{ comment: summary("A function.") }] }, "A function."],
    ["an accessor's comment", { getSignature: { comment: summary("An accessor.") } }, "An accessor."],
    ["nothing without a comment", { name: "x" }, undefined],
    ["nothing for an empty summary", { comment: summary("  ") }, undefined],
    ["nothing for no model", undefined, undefined],
  ])("%s", (_, model, description) => {
    expect(descriptionOf(model)).toBe(description);
  });

  it("shortens long summaries", () => {
    const description = descriptionOf({ comment: summary("word ".repeat(100)) }) ?? "";
    expect(description).toHaveLength(200);
    expect(description.endsWith("word…")).toBe(true);
  });
});

describe("withDescription()", () => {
  it("prepends front matter with a quoted description", () => {
    expect(withDescription("# Page\n", 'Say "hi"')).toBe('---\ndescription: "Say \\"hi\\""\n---\n\n# Page\n');
  });
});

describe("load()", () => {
  it("adds the description to pages whose model has one", () => {
    const on = vi.fn<(event: string, listener: (page: MarkdownPageEvent) => void) => void>();
    load({ renderer: { on } } as unknown as MarkdownApplication);
    expect(on).toHaveBeenCalledWith(MarkdownPageEvent.END, expect.any(Function));
    const listener = on.mock.calls[0]?.[1];
    const documented = Object.assign(new MarkdownPageEvent({ comment: summary("Documented.") } as never), { contents: "# A" });
    const undocumented = Object.assign(new MarkdownPageEvent({} as never), { contents: "# B" });
    const empty = new MarkdownPageEvent({ comment: summary("Documented.") } as never);
    (empty as { contents?: string }).contents = undefined;
    for (const page of [documented, undocumented, empty]) listener?.(page as MarkdownPageEvent);
    expect(documented.contents).toBe('---\ndescription: "Documented."\n---\n\n# A');
    expect(undocumented.contents).toBe("# B");
    expect(empty.contents).toBeUndefined();
  });
});
