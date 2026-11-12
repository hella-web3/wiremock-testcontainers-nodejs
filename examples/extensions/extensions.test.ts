import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type WireMockExtension,
  WiremockContainer,
  type WiremockExtensionJar,
} from "@hellaweb3/wiremock-testcontainers-nodejs";
import {
  BodyLengthMatcher,
  GlobalResponseTemplating,
  JARS,
  JAVA_PACKAGE,
  JavaExtension,
  PoweredByTransformer,
  StubCountAdminApi,
  UppercaseTransformer,
} from ".";

/**
 * Unit tests of the example extensions – no container needed: what each one asks WireMock to
 * load, its stub helpers, and how `WiremockContainer` validates it. Their behaviour inside
 * WireMock is tested by `e2e/extensions.e2e.test.ts`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The absolute path of a module-relative JAR. */
const jarPath = (jar: WiremockExtensionJar): string => {
  const { module, file } = jar as { module: string; file: string };
  return fileURLToPath(new URL(file, module));
};

/** A custom extension built on `JavaExtension`, as an author would write one. */
class AcmeTransformer extends JavaExtension {
  constructor() {
    super({ name: "acme", className: "com.acme.AcmeTransformer", jar: "./acme.jar" });
  }
}

describe("JARS", () => {
  it.each(Object.entries(JARS))("%s resolves to a JAR next to the module, from any working directory", (_, jar) => {
    expect(existsSync(jarPath(jar))).toBe(true);
  });
});

describe("what each extension asks WireMock to load", () => {
  it.each([
    [UppercaseTransformer, "uppercase", [`${JAVA_PACKAGE}.UppercaseTransformer`], [JARS.examples]],
    [BodyLengthMatcher, "body-too-long", [`${JAVA_PACKAGE}.BodyLengthMatcher`], [JARS.examples]],
    [StubCountAdminApi, "stub-count", [`${JAVA_PACKAGE}.StubCountAdminApi`], [JARS.examples]],
  ])("%o: a Java class from the example JAR", (Extension, name, classNames, jars) => {
    const extension = new Extension();
    expect(extension.getName()).toBe(name);
    expect(extension.getClassNames()).toEqual(classNames);
    expect(extension.getJars()).toEqual(jars);
  });

  it("PoweredByTransformer: only its JAR – WireMock finds the class by scanning", () => {
    const extension: WireMockExtension = new PoweredByTransformer();
    expect(extension.getName()).toBe("powered-by");
    expect(extension.getClassNames).toBeUndefined();
    expect(extension.getJars?.()).toEqual([JARS.poweredBy]);
  });

  it("JavaExtension turns a subclass's definition into name, class name and JAR", () => {
    const acme = new AcmeTransformer();
    expect([acme.getName(), acme.getClassNames(), acme.getJars()]).toEqual(["acme", ["com.acme.AcmeTransformer"], ["./acme.jar"]]);
  });
});

describe("GlobalResponseTemplating – configuration only, configurable", () => {
  it("turns on global templating by default", () => {
    expect(new GlobalResponseTemplating().getOptions()).toEqual(["--global-response-templating"]);
  });

  it("adds the cache limit when configured", () => {
    expect(new GlobalResponseTemplating({ maxCacheEntries: 100 }).getOptions()).toEqual([
      "--global-response-templating",
      "--max-template-cache-entries=100",
    ]);
  });

  it("keeps its own copy of the options", () => {
    const options = { maxCacheEntries: 100 };
    const templating = new GlobalResponseTemplating(options);
    options.maxCacheEntries = 5;
    expect(templating.getOptions()).toContain("--max-template-cache-entries=100");
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects maxCacheEntries %s at once – WireMock would crash at start-up", (maxCacheEntries) => {
    expect(() => new GlobalResponseTemplating({ maxCacheEntries })).toThrow(`maxCacheEntries must be a positive integer, got ${maxCacheEntries}`);
  });
});

describe("stub helpers", () => {
  it("UppercaseTransformer.transform() names the transformer, with parameters only when given", () => {
    expect(UppercaseTransformer.transform()).toEqual({ transformers: ["uppercase"] });
    expect(UppercaseTransformer.transform({ suffix: "!" })).toEqual({ transformers: ["uppercase"], transformerParameters: { suffix: "!" } });
  });

  it("BodyLengthMatcher.longerThan() builds the custom matcher", () => {
    expect(BodyLengthMatcher.longerThan(0)).toEqual({ customMatcher: { name: "body-too-long", parameters: { maxLength: 0 } } });
    expect(BodyLengthMatcher.longerThan(20).customMatcher.parameters.maxLength).toBe(20);
  });

  it.each([-1, 2.5, Number.NaN])("BodyLengthMatcher.longerThan(%s) is rejected", (maxLength) => {
    expect(() => BodyLengthMatcher.longerThan(maxLength)).toThrow(`maxLength must be a non-negative integer, got ${maxLength}`);
  });

  it("helpers spread into stubs the library accepts", () => {
    const stub = {
      request: { method: "POST", url: "/notes", ...BodyLengthMatcher.longerThan(20) },
      response: { status: 200, body: "ok", ...UppercaseTransformer.transform({ suffix: "!" }) },
    };
    expect(() => new WiremockContainer().withMapping("notes", { json: stub })).not.toThrow();
  });
});

describe("StubCountAdminApi.count() – the typed admin client", () => {
  const wiremock = { getAdminUrl: () => "http://localhost:8080/__admin" };

  it("GETs /__admin/stub-count and returns the count", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ count: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(StubCountAdminApi.count(wiremock)).resolves.toBe(3);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://localhost:8080/__admin/stub-count");
  });

  it("explains a failing route – usually a missing registration", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("No such route", { status: 404 })));
    await expect(StubCountAdminApi.count(wiremock)).rejects.toThrow(
      "GET http://localhost:8080/__admin/stub-count failed with 404 – is StubCountAdminApi registered?",
    );
  });
});

describe("registering the example extensions", () => {
  it("accepts classes, instances and object literals together", () => {
    const shortJournal: WireMockExtension = { getName: () => "short-journal", getOptions: () => ["--max-request-journal=2"] };
    const container = new WiremockContainer().withExtensions([
      UppercaseTransformer,
      new BodyLengthMatcher(),
      StubCountAdminApi,
      PoweredByTransformer,
      new GlobalResponseTemplating({ maxCacheEntries: 100 }),
      shortJournal,
    ]);
    expect(container).toBeInstanceOf(WiremockContainer);
  });

  it("treats registering an extension again – as class or instance – as a no-op", () => {
    expect(() =>
      new WiremockContainer()
        .withExtension(UppercaseTransformer)
        .withExtension(new UppercaseTransformer())
        .withExtension(GlobalResponseTemplating)
        .withExtension(new GlobalResponseTemplating()),
    ).not.toThrow();
  });

  it("rejects one name with two configurations", () => {
    const container = new WiremockContainer().withExtension(GlobalResponseTemplating);
    expect(() => container.withExtension(new GlobalResponseTemplating({ maxCacheEntries: 100 }))).toThrow(
      'another extension named "response-template" is already registered; names must be unique',
    );
  });
});

describe("troubleshooting: the errors the guide lists, all raised before anything starts", () => {
  it.each<[string, () => unknown, string]>([
    ["an extension's short name instead of its class", () => new WiremockContainer().withExtension("uppercase"), "is not a fully qualified Java class name"],
    ["an extension with nothing to load", () => new WiremockContainer().withExtension({ getName: () => "empty" }), "it contributes nothing"],
    [
      "an option split over two entries",
      () => new WiremockContainer().withExtension({ getName: () => "journal", getOptions: () => ["--max-request-journal", "2"] }),
      'must be "--flag" or "--option=value"',
    ],
    ["a JAR that does not exist", () => new WiremockContainer().withExtension(AcmeTransformer), "does not exist"],
    ["a JAR without the .jar extension", () => new WiremockContainer().withExtensionJar({ ...JARS.examples, file: "../__mocks__/wiremock/mappings/get-payments.json" }), 'must end in ".jar"'],
  ])("%s", (_, register, message) => {
    expect(register).toThrow(message);
  });

  it("a class in none of the registered JARs fails start() with a suggestion", async () => {
    const typo = new WiremockContainer().withExtensionJar(JARS.examples).withExtension("com.acme.UppercaseTransformer");
    await expect(typo.start()).rejects.toThrow(`did you mean "${JAVA_PACKAGE}.UppercaseTransformer"?`);
  });
});
