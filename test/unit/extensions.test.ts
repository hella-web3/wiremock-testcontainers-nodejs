import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GenericContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type ExtensionInput, type WireMockExtension, WiremockContainer, type WiremockExtensionJar } from "../../src";
import { setRuntime, type WiremockStartRequest } from "../../src/runtime";
import { expectFiles, pendingCopies } from "../helpers/container";
import {
  ABSOLUTE_JARS,
  CLASSES,
  EXAMPLE_JAR,
  EXTENSION_FIXTURE_DIR,
  extensionsPath,
  GlobalResponseTemplating,
  JAR_SCRATCH_DIR,
  JARS,
  POWERED_BY_JAR,
  UppercaseExtension,
  writeJarScratch,
} from "../helpers/extensions";
import { populatedContainer } from "../helpers/fixtures";

/**
 * `withExtension(s)()`, `withExtensionJar(s)()` and `withExtensionOptions()`, without Docker: JARs
 * are asserted on the archive the container would receive, the WireMock command on what `start()`
 * hands a stubbed runtime (or Docker).
 */

/** Every `start()` is served by this fake runtime, which records the request. */
const starts: WiremockStartRequest[] = [];
const fakeStarted = { getHost: () => "127.0.0.1", getMappedPort: () => 8080 };

/** The WireMock CLI arguments `start()` would run `container` with. */
const commandOf = async (container: WiremockContainer): Promise<readonly string[]> => {
  await container.start();
  return starts.at(-1)?.command ?? [];
};
const extensionsFlag = (...classNames: string[]): string[] => ["--extensions", classNames.join(",")];

/** Starting `container` fails with `message` before any runtime is asked to start it. */
const expectStartFailure = async (container: WiremockContainer, message: string): Promise<void> => {
  await expect(container.start()).rejects.toThrow(message);
  expect(starts).toEqual([]);
};

/** An object-literal TypeScript extension. */
const literal = (name: string, members: Omit<WireMockExtension, "getName"> = {}): WireMockExtension => ({ getName: () => name, ...members });

beforeAll(writeJarScratch);
beforeEach(() => {
  starts.length = 0;
  setRuntime({ start: async (request) => (starts.push(request), fakeStarted as never) });
});
afterEach(() => {
  setRuntime(undefined);
  vi.restoreAllMocks();
});
afterAll(() => rmSync(JAR_SCRATCH_DIR, { recursive: true, force: true }));

/**
 * One test per case – `case name → [registration, expected error]`: applied to a container with
 * mappings, files, a JAR and a class name, it must throw and change neither the files nor the command.
 */
const rejectsExtension = (cases: Record<string, [(container: WiremockContainer) => unknown, string]>): void => {
  for (const [name, [register, message]] of Object.entries(cases)) {
    it(`rejects ${name}: throws '${message}' and registers nothing`, async () => {
      const container = populatedContainer().withExtensionJar(ABSOLUTE_JARS.example).withExtension(CLASSES.uppercase);
      const [copies, command] = [pendingCopies(container), await commandOf(container)];
      expect(() => register(container)).toThrow(message);
      expect(pendingCopies(container)).toEqual(copies);
      expect(await commandOf(container)).toEqual(command);
    });
  }
};

describe("WiremockContainer.withExtension(className) / withExtensions([...]) → one --extensions flag", () => {
  it("passes a class name to WireMock's --extensions", async () => {
    expect(await commandOf(new WiremockContainer().withExtensionJar(EXAMPLE_JAR).withExtension(CLASSES.uppercase))).toEqual(extensionsFlag(CLASSES.uppercase));
  });

  it("joins several class names into one flag – WireMock crashes on a repeated --extensions – in registration order, without repeats", async () => {
    const container = new WiremockContainer()
      .withExtensionJar(EXAMPLE_JAR)
      .withExtensions([CLASSES.stubCount, CLASSES.uppercase])
      .withExtension(` ${CLASSES.bodyLength} `) // trimmed
      .withExtension(CLASSES.stubCount);
    expect(await commandOf(container)).toEqual(extensionsFlag(CLASSES.stubCount, CLASSES.uppercase, CLASSES.bodyLength));
  });

  it("appends to withCommand() and keeps it: the builder starts again – also concurrently – with the same command", async () => {
    const container = new WiremockContainer().withCommand(["--verbose"]).withExtensionJar(EXAMPLE_JAR).withExtension(CLASSES.uppercase);
    const expected = ["--verbose", ...extensionsFlag(CLASSES.uppercase)];
    expect(await commandOf(container)).toEqual(expected);
    expect(await commandOf(container)).toEqual(expected);
    await Promise.all([container.start(), container.start()]);
    expect(starts.slice(-2).map(({ command }) => command)).toEqual([expected, expected]);
  });

  it("recomputes the command on every start: later registrations, options and withCommand() all count", async () => {
    const container = new WiremockContainer().withExtensionJar(EXAMPLE_JAR).withExtensionOptions({ scanning: false });
    expect(await commandOf(container)).toEqual(["--disable-extensions-scanning"]);
    container.withExtension(CLASSES.uppercase).withCommand(["--verbose"]);
    expect(await commandOf(container)).toEqual(["--verbose", "--disable-extensions-scanning", ...extensionsFlag(CLASSES.uppercase)]);
    container.withExtensionOptions({ scanning: true });
    expect(await commandOf(container)).toEqual(["--verbose", ...extensionsFlag(CLASSES.uppercase)]);
    expect(await commandOf(new WiremockContainer().withExtensionJar(EXAMPLE_JAR).withExtensionOptions({ scanning: false }).withExtensionOptions({ scanning: true }))).toEqual([]);
  });

  it("leaves the command alone without extensions", async () => {
    expect(await commandOf(new WiremockContainer())).toEqual([]);
    expect(await commandOf(new WiremockContainer().withCommand(["--verbose"]))).toEqual(["--verbose"]);
  });

  it("accepts WireMock's own classes without a JAR: the image ships them", async () => {
    const builtIns = ["com.github.tomakehurst.wiremock.extension.responsetemplating.ResponseTemplateTransformer", "org.wiremock.webhooks.Webhooks"];
    expect(await commandOf(new WiremockContainer().withExtensions(builtIns))).toEqual(extensionsFlag(...builtIns));
  });

  it("accepts a nested class by its binary name (Outer$Inner)", async () => {
    expect(await commandOf(new WiremockContainer().withExtensionJar(JARS.nested).withExtension("com.acme.Outer$Inner"))).toEqual(extensionsFlag("com.acme.Outer$Inner"));
  });

  rejectsExtension({
    "an empty class name": [(c) => c.withExtension(""), 'WiremockContainer.withExtension: "class name" must be a non-empty string'],
    "an extension's short name": [(c) => c.withExtension("uppercase"), '"uppercase" is not a fully qualified Java class name such as "com.acme.MyTransformer" (include the package'],
    "a .class file name": [(c) => c.withExtension("com.acme.Foo.class"), 'drop the ".class" suffix'],
    "a path": [(c) => c.withExtension("com/acme/Foo"), 'separate packages with "." not "/"'],
    "a name with a dash": [(c) => c.withExtension("com.acme.response-template"), "only letters, digits, _ and $ may form each part"],
    "a number": [(c) => c.withExtension(42 as never), "unsupported extension 42; expected a fully qualified Java class name, a WireMockExtension or its class"],
    "null": [(c) => c.withExtension(null as never), "unsupported extension null"],
    "an object without getName()": [(c) => c.withExtension({ name: "x" } as never), 'unsupported extension {"name":"x"}'],
    "a non-array for withExtensions()": [(c) => c.withExtensions(CLASSES.uppercase as never), `WiremockContainer.withExtensions: expected an array, got "${CLASSES.uppercase}"`],
    "a batch with one invalid class name - all or nothing": [(c) => c.withExtensions([CLASSES.stubCount, "nope"]), '"nope" is not a fully qualified Java class name'],
  });
});

describe("WiremockContainer.withExtensionJar(source) / withExtensionJars([...]) → /var/wiremock/extensions/<name>.jar", () => {
  it.each(
    Object.entries<WiremockExtensionJar>({
      "a relative path": EXAMPLE_JAR,
      "an absolute path": ABSOLUTE_JARS.example,
      "a file: URL object": pathToFileURL(ABSOLUTE_JARS.example),
      "a file: URL string": pathToFileURL(ABSOLUTE_JARS.example).href,
      "{ file }": { file: EXAMPLE_JAR },
      "{ module: import.meta.url, file }": { module: import.meta.url, file: "../__mocks__/extensions/example-extensions.jar" },
    }),
  )("source %s: copies the JAR byte-for-byte under its base name", (_, source) =>
    expectFiles(new WiremockContainer().withExtensionJar(source), { [extensionsPath("example-extensions.jar")]: EXAMPLE_JAR }));

  it("{ package, file } – a JAR or a directory of JARs shipped in an npm package", () => {
    vi.spyOn(process, "cwd").mockReturnValue(JAR_SCRATCH_DIR);
    const container = new WiremockContainer().withExtensionJars([
      { package: JARS.packages.single, file: "lib/example-extensions.jar" },
      { package: JARS.packages.directory, file: "jars" },
    ]);
    return expectFiles(container, { [extensionsPath("example-extensions.jar")]: EXAMPLE_JAR, [extensionsPath("powered-by-extension.jar")]: POWERED_BY_JAR });
  });

  it("renames a JAR with { file, name } – e.g. to give a .zip the .jar extension WireMock's class path needs", () =>
    expectFiles(new WiremockContainer().withExtensionJar({ file: JARS.zipExtension, name: "renamed.jar" }), { [extensionsPath("renamed.jar")]: EXAMPLE_JAR }));

  it("adds every *.jar / *.JAR directly in a directory – a Java `dir/*` class-path entry – and ignores other files", () =>
    expectFiles(new WiremockContainer().withExtensionJar(JARS.directory), {
      [extensionsPath("a-powered-by.JAR")]: POWERED_BY_JAR,
      [extensionsPath("b-example.jar")]: EXAMPLE_JAR,
    }));

  it("registers several JARs; registering the same JAR again – directly or through its directory – is a no-op", () =>
    expectFiles(new WiremockContainer().withExtensionJars([EXAMPLE_JAR, POWERED_BY_JAR]).withExtensionJars([EXTENSION_FIXTURE_DIR]).withExtensionJar(EXAMPLE_JAR), {
      [extensionsPath("example-extensions.jar")]: EXAMPLE_JAR,
      [extensionsPath("powered-by-extension.jar")]: POWERED_BY_JAR,
    }));

  it("accepts a JAR of resources only, such as META-INF/services pointing into another JAR", () =>
    expectFiles(new WiremockContainer().withExtensionJar(JARS.servicesOnly), { [extensionsPath("services-only.jar")]: JARS.servicesOnly }));

  it("puts JARs on the class path without --extensions: WireMock loads what their META-INF/services declare", async () => {
    expect(await commandOf(new WiremockContainer().withExtensionJar(POWERED_BY_JAR))).toEqual([]);
    expect(starts[0].files).toEqual([{ source: resolve(POWERED_BY_JAR), target: extensionsPath("powered-by-extension.jar") }]);
  });

  it.skipIf(process.getuid?.() === 0)("rejects an unreadable JAR with its error code (root reads everything, so not as root)", () => {
    const container = new WiremockContainer();
    expect(() => container.withExtensionJar(JARS.unreadable)).toThrow(`WiremockContainer.withExtensionJar: "${JARS.unreadable}" cannot be read: EACCES: permission denied`);
    expect(pendingCopies(container)).toEqual([]);
  });

  rejectsExtension({
    "a missing JAR": [(c) => c.withExtensionJar("./nope.jar"), `WiremockContainer.withExtensionJar: "${resolve("nope.jar")}" does not exist`],
    "a text file named .jar": [(c) => c.withExtensionJar(JARS.notAZip), `"${JARS.notAZip}" is not a valid JAR: not a ZIP archive`],
    "an empty ZIP": [(c) => c.withExtensionJar(JARS.empty), `"${JARS.empty}" contains no Java classes – is it really an extension JAR?`],
    "a ZIP of resources only": [(c) => c.withExtensionJar(JARS.resourcesOnly), "contains no Java classes"],
    "a file without the .jar extension": [(c) => c.withExtensionJar(JARS.zipExtension), '"example-extensions.zip" must end in ".jar" – WireMock\'s class path picks up only *.jar files; pass { file, name: "<name>.jar" } to rename it'],
    "a name with a directory": [(c) => c.withExtensionJar({ file: EXAMPLE_JAR, name: "lib/x.jar" }), 'name "lib/x.jar" must be a file name: WireMock\'s class path holds only the JARs directly in /var/wiremock/extensions'],
    "an empty name": [(c) => c.withExtensionJar({ file: EXAMPLE_JAR, name: "" }), '"name" must be a non-empty string'],
    "a name for a directory": [(c) => c.withExtensionJar({ file: JARS.directory, name: "x.jar" }), `"name" cannot rename the directory "${JARS.directory}", only a single JAR`],
    "a directory without JARs": [(c) => c.withExtensionJar(JARS.emptyDirectory), `the directory "${JARS.emptyDirectory}" contains no *.jar files`],
    "a directory named like a JAR, without JARs": [(c) => c.withExtensionJar(JARS.directoryNamedJar), "contains no *.jar files"],
    "a device instead of a file": [(c) => c.withExtensionJar("/dev/null"), '"/dev/null" is not a file'],
    "an https: URL": [(c) => c.withExtensionJar(new URL("https://example.com/a.jar")), '"source" must be a path or a file: URL'],
    "a package that is not installed": [(c) => c.withExtensionJar({ package: "@acme/missing", file: "a.jar" }), 'package "@acme/missing" is not installed'],
    "another JAR with the same name": [(c) => c.withExtensionJar(JARS.impostor), `"${extensionsPath("example-extensions.jar")}" is already registered from ${ABSOLUTE_JARS.example}; registering ${JARS.impostor} would overwrite it`],
    "a batch with one missing JAR - all or nothing": [(c) => c.withExtensionJars([POWERED_BY_JAR, "./nope.jar"]), "does not exist"],
    "a non-array for withExtensionJars()": [(c) => c.withExtensionJars(EXAMPLE_JAR as never), "WiremockContainer.withExtensionJars: expected an array"],
  });
});

describe("TypeScript extensions: a WireMockExtension, or its class, bundles class names, JARs and options", () => {
  it("registers a class: instantiates it and copies its JAR and class name", async () => {
    const container = new WiremockContainer().withExtension(UppercaseExtension);
    await expectFiles(container, { [extensionsPath("example-extensions.jar")]: EXAMPLE_JAR });
    expect(await commandOf(container)).toEqual(extensionsFlag(CLASSES.uppercase));
  });

  it("registers an instance and an object literal, each with several class names, JARs and options", async () => {
    const container = new WiremockContainer().withExtensions([
      new GlobalResponseTemplating(),
      literal("everything", {
        getClassNames: () => [CLASSES.stubCount, CLASSES.bodyLength],
        getJars: () => [EXAMPLE_JAR, { file: POWERED_BY_JAR, name: "powered.jar" }],
        getOptions: () => ["--max-request-journal=100"],
      }),
    ]);
    await expectFiles(container, { [extensionsPath("example-extensions.jar")]: EXAMPLE_JAR, [extensionsPath("powered.jar")]: POWERED_BY_JAR });
    expect(await commandOf(container)).toEqual(["--global-response-templating", "--max-request-journal=100", ...extensionsFlag(CLASSES.stubCount, CLASSES.bodyLength)]);
  });

  it("treats the same extension registered again – class, instance or identical literal – as a no-op", async () => {
    const container = new WiremockContainer()
      .withExtension(UppercaseExtension)
      .withExtension(new UppercaseExtension())
      .withExtensions([GlobalResponseTemplating, literal("response-template", { getOptions: () => ["--global-response-templating"] })])
      .withExtension(CLASSES.uppercase);
    expect(await commandOf(container)).toEqual(["--global-response-templating", ...extensionsFlag(CLASSES.uppercase)]);
  });

  it("de-duplicates options extensions share and those withCommand() or WIREMOCK_OPTIONS already set", async () => {
    const container = new WiremockContainer()
      .withCommand(["--verbose", "--global-response-templating"])
      .withEnvironment({ WIREMOCK_OPTIONS: "--disable-gzip" })
      .withExtensions([GlobalResponseTemplating, literal("gzip", { getOptions: () => ["--disable-gzip", "--global-response-templating"] })]);
    expect(await commandOf(container)).toEqual(["--verbose", "--global-response-templating"]);
  });

  it("is typed: ExtensionInput covers class names, extension classes and instances", () => {
    const inputs: ExtensionInput[] = [CLASSES.uppercase, UppercaseExtension, new GlobalResponseTemplating()];
    expect(() => new WiremockContainer().withExtensions(inputs)).not.toThrow();
  });

  rejectsExtension({
    "an extension contributing nothing": [(c) => c.withExtension(literal("empty")), 'extension "empty": it contributes nothing: implement getClassNames(), getJars() or getOptions()'],
    "getName() returning no string": [(c) => c.withExtension({ getName: () => undefined } as never), '"getName()" must be a non-empty string, got undefined'],
    "a class whose constructor throws": [
      (c) => c.withExtension(class Broken implements WireMockExtension {
        constructor() { throw new Error("boom"); }
        getName(): string { return "broken"; }
      }),
      "could not instantiate the extension class Broken: boom",
    ],
    "an anonymous class whose constructor throws": [(c) => c.withExtension((() => class { constructor() { throw new Error("boom"); } getName(): string { return "x"; } })()), "could not instantiate the extension class (anonymous): boom"],
    "getClassNames() returning a string": [(c) => c.withExtension(literal("x", { getClassNames: () => CLASSES.uppercase as never })), `extension "x": getClassNames() must return an array, got "${CLASSES.uppercase}"`],
    "getJars as a property": [(c) => c.withExtension({ getName: () => "x", getJars: [EXAMPLE_JAR] } as never), "getJars must be a method"],
    "an invalid class name": [(c) => c.withExtension(literal("x", { getClassNames: () => ["x"] })), 'extension "x": "x" is not a fully qualified Java class name'],
    "a missing JAR": [(c) => c.withExtension(literal("x", { getJars: () => ["./nope.jar"] })), `extension "x": "${resolve("nope.jar")}" does not exist`],
    "an option with its value as a separate entry": [(c) => c.withExtension(literal("x", { getOptions: () => ["--max-request-journal", "100"] })), 'option "100" must be "--flag" or "--option=value", one option per entry'],
    "an option with a space": [(c) => c.withExtension(literal("x", { getOptions: () => ["--port 8080"] })), 'option "--port 8080" must be'],
    "--extensions as an option": [(c) => c.withExtension(literal("x", { getOptions: () => ["--extensions=com.acme.X"] })), 'set class names with getClassNames(), not "--extensions"'],
    "options conflicting between extensions": [
      (c) => c.withExtensions([literal("a", { getOptions: () => ["--max-request-journal=1"] }), literal("b", { getOptions: () => ["--max-request-journal=2"] })]),
      'extension "b": option "--max-request-journal=2" conflicts with "--max-request-journal=1" set by another extension; WireMock accepts each option only once',
    ],
    "another extension with a registered name": [(c) => c.withExtensions([UppercaseExtension, literal("uppercase", { getClassNames: () => [CLASSES.stubCount] })]), 'another extension named "uppercase" is already registered; names must be unique'],
    "an extension whose JAR clashes": [(c) => c.withExtension(literal("x", { getJars: () => [JARS.impostor] })), "would overwrite it"],
  });
});

describe("WiremockContainer.withExtensionOptions({ scanning, verifyClassNames })", () => {
  it("scanning: false passes --disable-extensions-scanning – JARs' META-INF/services are ignored", async () => {
    expect(await commandOf(new WiremockContainer().withExtensionJar(POWERED_BY_JAR).withExtensionOptions({ scanning: false }))).toEqual(["--disable-extensions-scanning"]);
    expect(await commandOf(new WiremockContainer().withExtensionOptions({ scanning: false }).withExtensionOptions({ scanning: true }))).toEqual([]);
    expect(await commandOf(new WiremockContainer().withCommand(["--disable-extensions-scanning"]).withExtensionOptions({ scanning: false }))).toEqual(["--disable-extensions-scanning"]);
  });

  it("verifyClassNames: false starts with classes no registered JAR has – e.g. baked into a custom image", async () => {
    const container = new WiremockContainer("acme/wiremock-with-extensions").withExtension("com.acme.Baked").withExtensionOptions({ verifyClassNames: false });
    expect(await commandOf(container)).toEqual(extensionsFlag("com.acme.Baked"));
  });

  it("keeps options it is not given, including those set to undefined", async () => {
    const container = new WiremockContainer().withExtensionOptions({ scanning: false }).withExtensionOptions({ scanning: undefined, verifyClassNames: true });
    expect(await commandOf(container)).toEqual(["--disable-extensions-scanning"]);
  });

  rejectsExtension({
    "an unknown option": [(c) => c.withExtensionOptions({ scan: false } as never), 'WiremockContainer.withExtensionOptions: unknown option "scan"; expected scanning or verifyClassNames'],
    "a non-boolean value": [(c) => c.withExtensionOptions({ scanning: "no" } as never), '"scanning" must be a boolean, got "no"'],
    "no object": [(c) => c.withExtensionOptions(null as never), "expected an options object, got null"],
  });
});

describe("WiremockContainer.start() validates extensions before anything starts", () => {
  it("fails for a class in no registered JAR, suggesting same-named classes", async () => {
    await expectStartFailure(
      new WiremockContainer().withExtensionJars([EXAMPLE_JAR, POWERED_BY_JAR]).withExtension("com.acme.uppercaseTransformer"),
      'WiremockContainer.start: class "com.acme.uppercaseTransformer" is in none of the registered extension JARs (example-extensions.jar, powered-by-extension.jar); ' +
        `did you mean "${CLASSES.uppercase}"? Register its JAR with withExtensionJar(), or – if the image already provides it – skip this check with withExtensionOptions({ verifyClassNames: false })`,
    );
  });

  it("suggests Outer$Inner for Outer.Inner, the binary name Java needs", () =>
    expectStartFailure(new WiremockContainer().withExtensionJar(JARS.nested).withExtension("com.acme.Outer.Inner"), 'did you mean "com.acme.Outer$Inner"?'));

  it("fails for a class without any JAR registered, whatever the registration order", async () => {
    await expectStartFailure(new WiremockContainer().withExtension(CLASSES.uppercase), `class "${CLASSES.uppercase}" is in no JAR: none is registered. Register its JAR`);
    await expect(new WiremockContainer().withExtension(CLASSES.uppercase).withExtensionJar(EXAMPLE_JAR).start()).resolves.toBeDefined();
  });

  it("fails when withCommand() or WIREMOCK_OPTIONS pass --extensions too: WireMock crashes on the second one", async () => {
    const message = "is already set by withCommand() or WIREMOCK_OPTIONS; WireMock accepts it only once – register those classes with withExtensions() instead";
    await expectStartFailure(new WiremockContainer().withCommand(["--extensions", "com.acme.A"]).withExtension("org.wiremock.webhooks.Webhooks"), `"--extensions" ${message}`);
    await expectStartFailure(new WiremockContainer().withEnvironment({ WIREMOCK_OPTIONS: "--extensions=com.acme.A" }).withExtension("org.wiremock.webhooks.Webhooks"), `"--extensions=com.acme.A" ${message}`);
  });

  it("leaves withCommand(['--extensions', …]) alone when no extension class is registered", async () => {
    expect(await commandOf(new WiremockContainer().withCommand(["--extensions", "com.acme.A"]).withExtensionJar(POWERED_BY_JAR))).toEqual(["--extensions", "com.acme.A"]);
  });

  it("fails when an extension option conflicts with withCommand()", () =>
    expectStartFailure(
      new WiremockContainer().withCommand(["--max-request-journal", "5"]).withExtension(literal("x", { getOptions: () => ["--max-request-journal=100"] })),
      'option "--max-request-journal=100" conflicts with "--max-request-journal" set by withCommand() or WIREMOCK_OPTIONS',
    ));
});

describe("WiremockContainer.start() failures name the extensions in use", () => {
  it("adds the extensions, the JARs and what usually goes wrong, keeping the cause", async () => {
    const cause = new Error("--no-docker: WireMock exited during start-up (exit code 1)");
    setRuntime({ start: async () => Promise.reject(cause) });
    const failure = new WiremockContainer().withExtensionJar(EXAMPLE_JAR).withExtensions([CLASSES.uppercase, CLASSES.stubCount]).start();
    await expect(failure).rejects.toThrow(
      `${cause.message}\nWireMock was started with extensions: ${CLASSES.uppercase}, ${CLASSES.stubCount}; JARs: example-extensions.jar. ` +
        "An extension stops WireMock if its class is missing (ClassNotFoundException), lacks a public no-argument constructor or targets a newer Java than the image's; " +
        "WireMock's output names the cause (Docker: run with DEBUG=testcontainers:containers).",
    );
    await expect(failure).rejects.toHaveProperty("cause", cause);
  });

  it("lists JARs loaded by scanning alone, and built-in classes without JARs", async () => {
    setRuntime({ start: async () => Promise.reject(new Error("boom")) });
    await expect(new WiremockContainer().withExtensionJar(POWERED_BY_JAR).start()).rejects.toThrow("boom\nWireMock was started with extensions: none; JARs: powered-by-extension.jar.");
    await expect(new WiremockContainer().withExtension("org.wiremock.webhooks.Webhooks").start()).rejects.toThrow(
      "boom\nWireMock was started with extensions: org.wiremock.webhooks.Webhooks; JARs: none.",
    );
  });

  it("passes other failures through untouched", async () => {
    const cause = new Error("boom");
    setRuntime({ start: async () => Promise.reject(cause) });
    await expect(new WiremockContainer().start()).rejects.toBe(cause);
  });
});

describe("WiremockContainer.start() in Docker", () => {
  beforeEach(() => setRuntime(undefined));

  it("runs the container with the extension arguments appended to the builder's command", async () => {
    let command: unknown;
    const docker = vi.spyOn(GenericContainer.prototype, "start").mockImplementation(async function (this: WiremockContainer) {
      command = (this as unknown as { createOpts: { Cmd?: string[] } }).createOpts.Cmd;
      return fakeStarted as never;
    });
    const container = new WiremockContainer().withCommand(["--verbose"]).withExtensionJar(EXAMPLE_JAR).withExtension(UppercaseExtension);
    const started = await container.start();
    expect(docker).toHaveBeenCalledOnce();
    expect(command).toEqual(["--verbose", ...extensionsFlag(CLASSES.uppercase)]);
    expect(started.rpcUrl).toBe("http://127.0.0.1:8080");
  });

  it("wraps a failed start – e.g. a wait strategy timing out on a crashed container", async () => {
    vi.spyOn(GenericContainer.prototype, "start").mockRejectedValue(new Error("Port 8080 not bound after 60000ms"));
    await expect(new WiremockContainer().withExtensionJar(EXAMPLE_JAR).withExtension(CLASSES.uppercase).start()).rejects.toThrow(
      `Port 8080 not bound after 60000ms\nWireMock was started with extensions: ${CLASSES.uppercase}; JARs: example-extensions.jar.`,
    );
  });
});
