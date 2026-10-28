import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { StartedWiremockContainer, WiremockContainer } from "../../src";
import { WIREMOCK_CONTAINER_NAME, WIREMOCK_FIXTURE_DIR } from "../helpers/fixtures";

const DEFAULT_IMAGE = "wiremock/wiremock:latest";
const CUSTOM_IMAGE = "wiremock/wiremock:3.13.0";
const WIREMOCK_PORT = 8080;
const HOST = "127.0.0.1";
const MAPPED_PORT = 41234;
const RPC_URL = `http://${HOST}:${MAPPED_PORT}`;

/** Representative errors raised by Testcontainers / the container runtime. */
const RUNTIME_FAILURES = [
  { mode: "no container runtime", message: "Could not find a working container runtime strategy" },
  { mode: "image pull denied", message: "(HTTP code 404) unexpected - pull access denied for wiremock/wiremock" },
  { mode: "start-up timeout", message: "Port 8080 not bound after 60000ms" },
  { mode: "container name conflict", message: '(HTTP code 409) conflict - The container name "/wiremock-testcontainer" is already in use' },
];

/**
 * Unit tests for the container wrapper. They run without Docker: the only
 * thing stubbed is `GenericContainer.prototype.start`, the single call that
 * talks to a container runtime. Image parsing, builder state, inheritance and
 * URL composition are exercised for real.
 */

/** Minimal fake of the object `GenericContainer.start()` resolves with. */
const fakeStartedContainer = (): StartedTestContainer =>
  ({
    getHost: vi.fn<() => string>(() => HOST),
    getMappedPort: vi.fn<() => number>(() => MAPPED_PORT),
    getId: vi.fn<() => string>(() => "abc123"),
    getName: vi.fn<() => string>(() => WIREMOCK_CONTAINER_NAME),
    stop: vi.fn<() => Promise<object>>(async () => ({})),
  }) as unknown as StartedTestContainer;

/** Exposes protected builder state of a GenericContainer for assertions. */
const internals = (container: GenericContainer) =>
  container as unknown as {
    imageName: { string: string };
    exposedPorts: number[];
    createOpts: { ExposedPorts?: Record<string, unknown>; name?: string };
    waitStrategy: unknown;
    directoriesToCopy: { source: string; target: string }[];
  };

describe("WiremockContainer", () => {
  let startSpy: MockInstance<GenericContainer["start"]>;

  beforeEach(() => {
    startSpy = vi.spyOn(GenericContainer.prototype, "start");
  });

  afterEach(() => startSpy.mockRestore());

  describe("constructor", () => {
    it("defaults to the official wiremock/wiremock image and accepts a custom one", () => {
      expect(internals(new WiremockContainer()).imageName.string).toBe(DEFAULT_IMAGE);
      expect(internals(new WiremockContainer(CUSTOM_IMAGE)).imageName.string).toBe(CUSTOM_IMAGE);
    });

    it("exposes WireMock's default port and waits for it to listen", () => {
      const container = internals(new WiremockContainer());
      expect(container.exposedPorts).toEqual([WIREMOCK_PORT]);
      expect(container.createOpts.ExposedPorts).toEqual({ [`${WIREMOCK_PORT}/tcp`]: {} });
      expect(container.waitStrategy).toBeInstanceOf(Wait.forListeningPorts().constructor);
    });

    it("keeps the full Testcontainers builder API available", () => {
      const container = new WiremockContainer();
      expect(container).toBeInstanceOf(GenericContainer);
      expect(container.withName(WIREMOCK_CONTAINER_NAME)).toBe(container);
      expect(internals(container).createOpts.name).toBe(WIREMOCK_CONTAINER_NAME);
    });
  });

  describe("withMappings()", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), "wiremock-"));
    });

    afterEach(() => rmSync(tmp, { recursive: true, force: true }));

    it("copies mappings/ and __files/ into WireMock's root directory", () => {
      const container = new WiremockContainer().withMappings(WIREMOCK_FIXTURE_DIR);
      expect(internals(container).directoriesToCopy).toEqual([
        { source: join(WIREMOCK_FIXTURE_DIR, "mappings"), target: "/home/wiremock/mappings" },
        { source: join(WIREMOCK_FIXTURE_DIR, "__files"), target: "/home/wiremock/__files" },
      ]);
    });

    it("copies only mappings/ when __files/ is absent (inline response bodies)", () => {
      mkdirSync(join(tmp, "mappings"));
      const container = new WiremockContainer().withMappings(tmp);
      expect(internals(container).directoriesToCopy).toEqual([
        { source: join(tmp, "mappings"), target: "/home/wiremock/mappings" },
      ]);
    });

    it("fails fast, before any image is pulled, when mappings/ is missing", () => {
      expect(() => new WiremockContainer().withMappings(tmp)).toThrow(
        `WiremockContainer.withMappings: "${join(tmp, "mappings")}" does not exist`,
      );
      expect(() => new WiremockContainer().withMappings(join(tmp, "nope"))).toThrow("does not exist");
    });

    it("returns the same instance and accumulates directories when chained", () => {
      mkdirSync(join(tmp, "mappings"));
      const container = new WiremockContainer();
      expect(container.withMappings(WIREMOCK_FIXTURE_DIR).withMappings(tmp)).toBe(container);
      expect(internals(container).directoriesToCopy.map(({ source }) => source)).toEqual([
        join(WIREMOCK_FIXTURE_DIR, "mappings"),
        join(WIREMOCK_FIXTURE_DIR, "__files"),
        join(tmp, "mappings"),
      ]);
    });
  });

  describe("start()", () => {
    it("starts the underlying container once and wraps it in a StartedWiremockContainer", async () => {
      const fake = fakeStartedContainer();
      startSpy.mockResolvedValue(fake);

      const started = await new WiremockContainer().start();

      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(started).toBeInstanceOf(StartedWiremockContainer);
      expect(started.rpcUrl).toBe(RPC_URL);
      expect(fake.getMappedPort).toHaveBeenCalledWith(WIREMOCK_PORT);
    });

    it.each(RUNTIME_FAILURES)("propagates the original error on $mode", async ({ message }) => {
      const cause = new Error(message);
      startSpy.mockRejectedValue(cause);
      await expect(new WiremockContainer().start()).rejects.toBe(cause);
    });

    it("propagates a failure to resolve the mapped port after the container started", async () => {
      const fake = fakeStartedContainer();
      vi.mocked(fake.getMappedPort).mockImplementation(() => {
        throw new Error("No port mapping found for 8080/tcp");
      });
      startSpy.mockResolvedValue(fake);
      await expect(new WiremockContainer().start()).rejects.toThrow("No port mapping found for 8080/tcp");
    });
  });
});

describe("StartedWiremockContainer", () => {
  const fake = fakeStartedContainer();
  const started = new StartedWiremockContainer(fake, RPC_URL);

  it("exposes a well-formed rpcUrl", () => {
    const url = new URL(started.rpcUrl);
    expect(started.rpcUrl).toBe(RPC_URL);
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe(HOST);
    expect(Number(url.port)).toBe(MAPPED_PORT);
  });

  it("delegates lifecycle and inspection calls to the underlying container", async () => {
    expect(started.getHost()).toBe(HOST);
    expect(started.getMappedPort(WIREMOCK_PORT)).toBe(MAPPED_PORT);
    expect(started.getId()).toBe("abc123");
    expect(started.getName()).toBe(WIREMOCK_CONTAINER_NAME);
    await started.stop();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it("stops the container on async dispose (`await using`)", async () => {
    const underlying = fakeStartedContainer();
    const disposable = new StartedWiremockContainer(underlying, RPC_URL);
    await disposable[Symbol.asyncDispose]();
    expect(underlying.stop).toHaveBeenCalledTimes(1);
  });
});
