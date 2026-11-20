/**
 * Java extensions without TypeScript wrappers: JARs, directories of JARs and class names, an
 * object-literal extension, and the options that control how extensions load. Each suite has its
 * own container, started in parallel with the others.
 *
 * @see https://hellalabs.dev/docs/wiremock-testcontainers-nodejs/docs/extensions/java-extensions
 */
import {
  type StartedWiremockContainer,
  type WireMockExtension,
  WiremockContainer,
  type WiremockExtensionOptions,
} from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// #region stub
/** The stub opts in to the transformer by its WireMock name. */
const SHOUT = { json: { request: { url: "/shout" }, response: { body: "hey", transformers: ["uppercase"] } } };
// #endregion stub

// #region object-literal
/** A one-off extension as an object literal: the journal keeps only the 2 newest requests. */
const shortJournal: WireMockExtension = {
  getName: () => "short-journal",
  getOptions: () => ["--max-request-journal=2"],
};
// #endregion object-literal

describe("a JAR, a class name and an object literal", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    // #region jar-and-class
    wiremock = await new WiremockContainer()
      .withExtensionJar("./__mocks__/extensions/example-extensions.jar") // onto WireMock's class path
      .withExtension("com.hellaweb3.wiremock.extensions.UppercaseTransformer") // --extensions <class>
      .withExtension(shortJournal)
      .withMapping("shout", SHOUT) // the stub opts in: transformers: ["uppercase"]
      .start();
    // #endregion jar-and-class
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

describe("withExtensionJars(): every JAR of a directory", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    // #region jar-directory
    wiremock = await new WiremockContainer()
      .withExtensionJars(["./__mocks__/extensions"]) // example-extensions.jar and powered-by-extension.jar
      .withExtension("com.hellaweb3.wiremock.extensions.UppercaseTransformer")
      .withMapping("shout", SHOUT)
      .start();
    // #endregion jar-directory
    await wiremock.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop();
  });

  // #region scanning-on
  it("loads classes by name, and scans JARs for the ones they declare in META-INF/services", async () => {
    const response = await fetch(wiremock.getUrl("/shout"));
    expect(await response.text()).toBe("HEY"); // UppercaseTransformer: named with withExtension()
    expect(response.headers.get("X-Powered-By")).toBe("wiremock-extensions"); // PoweredByTransformer: scanned
  });
  // #endregion scanning-on
});

describe("withExtensionOptions(): scanning and class-name verification", () => {
  let wiremock: StartedWiremockContainer;

  // #region options
  /** Load only the classes named with withExtension(); skip the check for JARs copied by other means. */
  const options: WiremockExtensionOptions = { scanning: false, verifyClassNames: false };
  // #endregion options

  beforeAll(async () => {
    // #region options-container
    wiremock = await new WiremockContainer()
      .withExtensionJar("./__mocks__/extensions/powered-by-extension.jar") // not scanned: its transformer stays off
      // A JAR the library does not know about – like one baked into a custom image:
      .withCopyFilesToContainer([
        { source: "./__mocks__/extensions/example-extensions.jar", target: "/var/wiremock/extensions/acme.jar" },
      ])
      .withExtension("com.hellaweb3.wiremock.extensions.UppercaseTransformer") // unverifiable: in no registered JAR
      .withExtensionOptions(options)
      .withMapping("shout", SHOUT)
      .start();
    // #endregion options-container
    await wiremock.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop();
  });

  it("scanning: false – the JAR's META-INF/services extension is not loaded", async () => {
    expect((await fetch(wiremock.getUrl("/shout"))).headers.get("X-Powered-By")).toBeNull();
  });

  it("verifyClassNames: false – a class from a JAR WireMock has by other means still loads", async () => {
    expect(await (await fetch(wiremock.getUrl("/shout"))).text()).toBe("HEY");
  });
});
