import { describe, expect, it } from "vitest";
import { DOCS_URL, libraryVersion, sourceUrl, versionLabel } from "../../src/lib/site.mts";
import { tempDir } from "../helpers.ts";

describe("site", () => {
  it("publishes the docs on GitHub Pages", () => {
    expect(DOCS_URL).toBe("https://hellalabs.dev/docs/wiremock-testcontainers-nodejs/docs/");
  });

  it("links sources on GitHub, on main by default, optionally with lines", () => {
    expect(sourceUrl("src/index.ts")).toBe("https://github.com/hella-labs/wiremock-testcontainers-nodejs/blob/main/src/index.ts");
    expect(sourceUrl("a.ts", "v1.0.0", [2, 4])).toBe("https://github.com/hella-labs/wiremock-testcontainers-nodejs/blob/v1.0.0/a.ts#L2-L4");
  });

  it("reads the library's version", () => {
    expect(libraryVersion()).toMatch(/^\d+\.\d+\.\d+/u);
    expect(libraryVersion(tempDir({ "package.json": '{ "version": "2.3.4" }' }))).toBe("2.3.4");
  });

  it.each([
    ["0.4.1", "0.x"],
    ["1.0.0", "1.x"],
    ["12.3.0-beta.1", "12.x"],
  ])("labels version %s as %s", (version, label) => {
    expect(versionLabel(version)).toBe(label);
  });
});
