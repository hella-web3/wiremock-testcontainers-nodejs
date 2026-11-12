import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type StartedWiremockContainer,
  type WireMockExtension,
  WiremockContainer,
} from "@hellaweb3/wiremock-testcontainers-nodejs";

/**
 * Extensions without wrapper classes: a JAR, a class name and an object literal. A file of its
 * own, so its container starts in parallel with the other suites'.
 */

/** A one-off extension as an object literal: the journal keeps only the 2 newest requests. */
const shortJournal: WireMockExtension = {
  getName: () => "short-journal",
  getOptions: () => ["--max-request-journal=2"],
};

describe("without wrapper classes: a JAR, a class name and an object literal", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    wiremock = await new WiremockContainer()
      .withExtensionJar("./__mocks__/extensions/example-extensions.jar")
      .withExtension("com.hellaweb3.wiremock.extensions.UppercaseTransformer")
      .withExtension(shortJournal)
      .withMapping("shout", {
        json: { request: { url: "/shout" }, response: { body: "hey", transformers: ["uppercase"] } },
      })
      .start();
    await wiremock.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop();
  });

  it("loads the class from the JAR", async () => {
    expect(await (await fetch(wiremock.getUrl("/shout"))).text()).toBe("HEY");
  });

  it("applies the object literal's option: only the 2 newest requests stay in the journal", async () => {
    // One at a time: WireMock may evict more than asked when concurrent requests overflow the journal.
    await fetch(wiremock.getUrl("/a"));
    await fetch(wiremock.getUrl("/b"));
    await fetch(wiremock.getUrl("/c"));
    const journal = await wiremock.findRequests({ method: "ANY", urlPattern: "/[abc]" });
    expect(journal.map(({ url }) => url).toSorted()).toEqual(["/b", "/c"]);
  });
});
