import type * as ChildProcessModule from "node:child_process";
import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { GenericContainer } from "testcontainers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartedWiremockContainer, WiremockContainer } from "../../src";
import { detectCI, installNoDockerRuntime, isNoDockerRequested, NO_DOCKER_ENV, type NoDockerOptions } from "../../src/no-docker";
import { getRuntime, setRuntime, type WiremockStartRequest } from "../../src/runtime";
import { ABSOLUTE, STANDALONE, WIREMOCK_FIXTURE_DIR } from "../helpers/fixtures";

/**
 * Unit tests for the `--no-docker` harness. They need neither Docker nor Java: the only
 * things stubbed are `spawn` (a fake JVM process) and the global `fetch` (WireMock's health
 * endpoint). JAR resolution, file materialisation, argument building, the CI/CD guard and
 * the container stand-in run for real; `pnpm test:e2e --no-docker` covers the real JVM.
 */
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcessModule>()),
  spawn: vi.fn<typeof spawn>(),
}));

/**
 * A JVM process stand-in that behaves like HotSpot: SIGTERM is a graceful exit (code 143) that
 * writes the class-data archive requested with `-XX:ArchiveClassesAtExit`; SIGKILL ends it at once.
 */
class FakeJvm extends EventEmitter {
  pid: number | undefined = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  ignoreSigterm = false;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn<(signal?: NodeJS.Signals) => boolean>((signal = "SIGTERM") => {
    if (signal !== "SIGTERM") this.exit(null, signal);
    else if (!this.ignoreSigterm) {
      const recording = this.args.find((arg) => arg.startsWith("-XX:ArchiveClassesAtExit="))?.split("=")[1];
      if (recording) writeFileSync(recording, "class data");
      this.exit(143);
    }
    return true;
  });

  constructor(readonly args: readonly string[] = []) {
    super();
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code;
    this.signalCode = signal;
    queueMicrotask(() => this.emit("exit", code, signal));
  }
}

const JAR = readdirSync("node_modules/wiremock/build").find((file) => file.endsWith(".jar")) ?? "";
const JAR_VERSION = /wiremock-standalone-(.+)\.jar$/u.exec(JAR)?.[1];
/** The installed JAR as Node resolves it (pnpm links packages from its store). */
const JAR_PATH = realpathSync(join("node_modules/wiremock/build", JAR));
const env = {}; // never the real environment: CI variables must not leak into these tests
const healthy = (): Response => new Response('{"status":"healthy"}', { status: 200 });

/** Java executable, arguments, environment and WireMock root of the `index`-th spawned JVM. */
const spawnCall = (index = 0) => {
  const [java, args, options] = vi.mocked(spawn).mock.calls[index] as unknown as [string, string[], { env: Record<string, string> }];
  return { java, args, env: options.env, jar: args[args.indexOf("-jar") + 1], home: args[args.indexOf("--root-dir") + 1] };
};

/** The value of the JVM flag `-XX:<name>=…` of the `index`-th spawned JVM. */
const flag = (index: number, name: string): string | undefined =>
  spawnCall(index).args.find((arg) => arg.startsWith(`-XX:${name}=`))?.split("=")[1];

const tempDirs = (): string[] => readdirSync(tmpdir()).filter((name) => name.startsWith("wiremock-no-docker-"));

describe("--no-docker harness", () => {
  let jvms: FakeJvm[];
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let log: ReturnType<typeof vi.fn<(message: string) => void>>;
  let uninstall: (() => void) | undefined;
  let started: StartedWiremockContainer[];

  /** Installs the runtime with a silent logger and the test environment. */
  const install = (options: NoDockerOptions = {}): (() => void) =>
    (uninstall = installNoDockerRuntime({ env, log, cacheDir: false, ...options })); // class-data caching has its own tests
  const start = async (container = new WiremockContainer()): Promise<StartedWiremockContainer> => {
    const running = await container.start();
    started.push(running);
    return running;
  };
  /** Starting `container` fails with `message` and leaves no temp directory behind. */
  const expectCleanFailure = async (message: string | RegExp, container = new WiremockContainer()): Promise<void> => {
    const before = tempDirs();
    await expect(start(container)).rejects.toThrow(message);
    expect(tempDirs()).toEqual(before);
  };

  beforeEach(() => {
    jvms = [];
    started = [];
    vi.mocked(spawn).mockImplementation((_java, args) => {
      const jvm = new FakeJvm(args as string[]);
      jvms.push(jvm);
      return jvm as unknown as ChildProcess;
    });
    fetchMock = vi.fn<typeof fetch>(async () => healthy());
    vi.stubGlobal("fetch", fetchMock);
    log = vi.fn<(message: string) => void>();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(started.map((container) => container.stop())); // removes every temp directory
    uninstall?.();
    uninstall = undefined;
    vi.mocked(spawn).mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("detectCI() and isNoDockerRequested()", () => {
    it.each([
      [{ CI: "true" }, "CI"],
      [{ CI: "1" }, "CI"],
      [{ GITHUB_ACTIONS: "true" }, "GITHUB_ACTIONS"],
      [{ GITLAB_CI: "yes" }, "GITLAB_CI"],
      [{ JENKINS_URL: "https://jenkins.example" }, "JENKINS_URL"],
      [{ CI: "false" }, undefined],
      [{ CI: "0" }, undefined],
      [{ CI: " " }, undefined],
      [{}, undefined],
    ])("detectCI(%j) → %s", (environment, expected) => {
      expect(detectCI(environment)).toBe(expected);
    });

    it.each([
      ["1", true],
      ["true", true],
      [" TRUE ", true],
      ["0", false],
      ["", false],
      [undefined, false],
    ])(`isNoDockerRequested with ${NO_DOCKER_ENV}=%j → %s`, (value, expected) => {
      expect(isNoDockerRequested({ [NO_DOCKER_ENV]: value })).toBe(expected);
    });

    it("defaults to process.env", () => {
      vi.stubEnv("CI", "true");
      vi.stubEnv(NO_DOCKER_ENV, "1");
      expect(detectCI()).toBe("CI");
      expect(isNoDockerRequested()).toBe(true);
      vi.unstubAllEnvs();
    });
  });

  describe("installNoDockerRuntime()", () => {
    it("refuses to run in CI/CD and registers nothing", () => {
      expect(() => install({ env: { CI: "true" } })).toThrow("--no-docker must not be used in CI/CD (detected CI=true)");
      expect(getRuntime()).toBeUndefined();
    });

    it("registers a runtime and returns an uninstaller that only removes its own", () => {
      const first = install();
      const registered = getRuntime();
      expect(registered).toBeDefined();
      const second = install();
      first(); // superseded – must not remove the second runtime
      expect(getRuntime()).toBeDefined();
      expect(getRuntime()).not.toBe(registered);
      second();
      expect(getRuntime()).toBeUndefined();
    });

    it("resolves the JAR of the installed `wiremock` npm package by default", async () => {
      install();
      await start();
      expect(spawnCall().jar).toBe(JAR_PATH);
    });

    it("accepts an explicit JAR from the options or $WIREMOCK_JAR", async () => {
      install({ jar: `node_modules/wiremock/build/${JAR}` });
      await start();
      install({ env: { WIREMOCK_JAR: `node_modules/wiremock/build/${JAR}` } });
      await start();
      expect(spawnCall(0).jar).toBe(join(process.cwd(), "node_modules/wiremock/build", JAR));
      expect(spawnCall(1).jar).toBe(spawnCall(0).jar);
    });

    it("fails fast with a clear message when the JAR is missing", () => {
      expect(() => install({ jar: "./nope.jar" })).toThrow(`--no-docker: WireMock JAR "${join(process.cwd(), "nope.jar")}" does not exist`);
      const project = mkdtempSync(join(tmpdir(), "no-wiremock-"));
      const cwd = vi.spyOn(process, "cwd").mockReturnValue(project);
      try {
        expect(() => install()).toThrow('install the "wiremock" npm package (e.g. `npm i -D wiremock`) or set WIREMOCK_JAR');
        mkdirSync(join(project, "node_modules/wiremock"), { recursive: true });
        writeFileSync(join(project, "node_modules/wiremock/package.json"), "{}");
        expect(() => install()).toThrow('the "wiremock" npm package contains no wiremock-standalone-*.jar');
        mkdirSync(join(project, "node_modules/wiremock/build"));
        expect(() => install()).toThrow("contains no wiremock-standalone-*.jar");
      } finally {
        cwd.mockRestore();
        rmSync(project, { recursive: true, force: true });
      }
      expect(getRuntime()).toBeUndefined();
    });

    it.each([
      [{ java: "/opt/java/bin/java" }, {}, "/opt/java/bin/java"],
      [{}, { WIREMOCK_JAVA: "/usr/lib/jvm/bin/java" }, "/usr/lib/jvm/bin/java"],
      [{}, { JAVA_HOME: "/jdk" }, join("/jdk", "bin", "java")],
      [{}, {}, "java"],
    ])("uses the Java executable from %j / %j → %s", async (options, environment, java) => {
      install({ ...options, env: environment });
      await start();
      expect(spawnCall().java).toBe(java);
    });
  });

  describe("starting a WiremockContainer", () => {
    it("never touches Docker and wraps the JVM in a StartedWiremockContainer", async () => {
      const docker = vi.spyOn(GenericContainer.prototype, "start");
      install();
      const container = await start();
      expect(docker).not.toHaveBeenCalled();
      expect(container).toBeInstanceOf(StartedWiremockContainer);
      expect(container.rpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      expect(fetchMock).toHaveBeenCalledWith(`${container.rpcUrl}/__admin/health`);
      docker.mockRestore();
    });

    it("materialises mappings, files and inline content exactly where the container would get them", async () => {
      install();
      await start(
        new WiremockContainer()
          .withMappings(WIREMOCK_FIXTURE_DIR)
          .withMapping("health", STANDALONE.health)
          .withMapping("ping", { json: { request: { url: "/ping" }, response: { status: 200 } } })
          .withFiles(STANDALONE.greetingBody)
          .withCopyContentToContainer([
            { content: Readable.from(["streamed"]), target: "/home/wiremock/__files/stream.txt" },
            { content: Buffer.from("bytes"), target: "/home/wiremock/__files/nested/bytes.bin" },
          ]),
      );
      const { home } = spawnCall();
      expect(readdirSync(join(home, "mappings")).toSorted()).toEqual(
        [...readdirSync(join(WIREMOCK_FIXTURE_DIR, "mappings")), "health.json", "ping.json"].toSorted(),
      );
      expect(readFileSync(join(home, "mappings/health.json"), "utf8")).toBe(readFileSync(STANDALONE.health, "utf8"));
      expect(readFileSync(join(home, "__files/greeting.txt"), "utf8")).toBe(readFileSync(ABSOLUTE.greeting, "utf8"));
      expect(readFileSync(join(home, "__files/stream.txt"), "utf8")).toBe("streamed");
      expect(readFileSync(join(home, "__files/nested/bytes.bin"), "utf8")).toBe("bytes");
    });

    it("creates empty mappings/ and __files/ for a container without registrations", async () => {
      install();
      await start();
      const { home } = spawnCall();
      expect(readdirSync(join(home, "mappings"))).toEqual([]);
      expect(readdirSync(join(home, "__files"))).toEqual([]);
    });

    it("runs WireMock fast-starting on a free loopback port with the builder's command, JAVA_OPTS, WIREMOCK_OPTIONS and environment", async () => {
      install();
      const container = await start(
        new WiremockContainer()
          .withCommand(["--verbose", "--global-response-templating"])
          .withEnvironment({ JAVA_OPTS: "-Xmx256m  -Dx=1", WIREMOCK_OPTIONS: "--max-request-journal 100", FOO: "bar" }),
      );
      const { args, env: childEnv, home } = spawnCall();
      const port = String(new URL(container.rpcUrl).port);
      expect(args).toEqual([
        "-XX:+IgnoreUnrecognizedVMOptions", "-XX:TieredStopAtLevel=1", // C1-only JIT; JAVA_OPTS come later and win
        "-Xmx256m", "-Dx=1", "-jar", expect.stringMatching(/\.jar$/u), "--port", port, "--bind-address", "127.0.0.1",
        "--root-dir", home, "--verbose", "--global-response-templating", "--max-request-journal", "100",
      ]);
      expect(childEnv).toMatchObject({ FOO: "bar", PATH: process.env.PATH });
    });

    it("warns on every start – image, JAR version, pid, URL and the CI/CD prohibition", async () => {
      install();
      const container = await start();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        `--no-docker: "wiremock/wiremock:latest" is NOT running in a container – WireMock ${JAR_VERSION} standalone ` +
          `(local JVM, pid 4242) serves ${container.rpcUrl} instead. Local development only; never use --no-docker in CI/CD.`,
      );
      await start();
      expect(log).toHaveBeenCalledTimes(2);
    });

    it("points out an image tag that differs from the JAR version", async () => {
      install();
      await start(new WiremockContainer("wiremock/wiremock:2.35.0"));
      await start(new WiremockContainer(`wiremock/wiremock:${JAR_VERSION}`));
      await start(new WiremockContainer(`wiremock/wiremock:${JAR_VERSION}-alpine`));
      await start(new WiremockContainer("wiremock/wiremock:3x-alpine"));
      await start(new WiremockContainer("wiremock/wiremock"));
      expect(log.mock.calls[0][0]).toContain(`The image tag "2.35.0" differs from the JAR version ${JAR_VERSION}.`);
      for (const [message] of log.mock.calls.slice(1)) expect(message).not.toContain("differs");
    });

    it("reports an unknown version for a JAR without a standard name", async () => {
      const dir = mkdtempSync(join(tmpdir(), "custom-jar-"));
      writeFileSync(join(dir, "wiremock.jar"), "");
      install({ jar: join(dir, "wiremock.jar") });
      await start();
      expect(log.mock.calls[0][0]).toContain("WireMock unknown standalone");
      rmSync(dir, { recursive: true, force: true });
    });

    it("warns through process.emitWarning by default", async () => {
      const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
      uninstall = installNoDockerRuntime({ env, cacheDir: false });
      await start();
      expect(emitWarning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("is NOT running in a container"), {
        code: "WIREMOCK_NO_DOCKER",
      });
      emitWarning.mockRestore();
    });

    it("falls back to the mappings endpoint as health probe on WireMock < 3.1", async () => {
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith("/health") ? new Response("", { status: 404 }) : new Response("{}", { status: 200 }),
      );
      install();
      const container = await start();
      expect(fetchMock).toHaveBeenCalledWith(`${container.rpcUrl}/__admin/mappings`);
    });

    it("polls until WireMock is healthy", async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValue(healthy());
      install();
      await start();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("kills the JVM at process exit, like Ryuk does for containers – one hook for all JVMs", async () => {
      vi.resetModules(); // a fresh module instance, so its exit hook is installed inside this test
      const fresh = await import("../../src/no-docker");
      const once = vi.spyOn(process, "once");
      uninstall = fresh.installNoDockerRuntime({ env, log, cacheDir: false });
      await start();
      await start();
      const hooks = once.mock.calls.filter(([event]) => event === "exit");
      once.mockRestore();

      expect(hooks).toHaveLength(1);
      (hooks[0][1] as () => void)();
      expect(jvms[0].kill).toHaveBeenCalledWith("SIGKILL");
      expect(jvms[1].kill).toHaveBeenCalledWith("SIGKILL");
    });
  });

  describe("start-up failures – the JVM is stopped and the temp directory removed", () => {

    it("explains a missing Java runtime", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const jvm = new FakeJvm();
        jvm.pid = undefined;
        queueMicrotask(() => jvm.emit("error", Object.assign(new Error("spawn java ENOENT"), { code: "ENOENT" })));
        return jvm as unknown as ChildProcess;
      });
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      install();
      await expectCleanFailure(
        '--no-docker: Java executable "java" not found – WireMock\'s standalone JAR needs a Java 11+ runtime; install one or set WIREMOCK_JAVA / JAVA_HOME',
      );
    });

    it("reports other spawn errors verbatim", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const jvm = new FakeJvm();
        jvm.pid = undefined;
        queueMicrotask(() => jvm.emit("error", Object.assign(new Error("spawn java EACCES"), { code: "EACCES" })));
        return jvm as unknown as ChildProcess;
      });
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      install();
      await expectCleanFailure('--no-docker: could not start "java": spawn java EACCES');
    });

    it("includes WireMock's output when the JVM exits during start-up", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const jvm = new FakeJvm();
        queueMicrotask(() => {
          jvm.stderr.emit("data", Buffer.from("Address already in use\n"));
          jvm.exit(1);
        });
        return jvm as unknown as ChildProcess;
      });
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      install();
      await expectCleanFailure(
        "--no-docker: WireMock exited during start-up (exit code 1)\n--- WireMock output ---\nAddress already in use",
      );
    });

    it("reports a JVM killed by a signal during start-up", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const jvm = new FakeJvm();
        queueMicrotask(() => jvm.exit(null, "SIGKILL"));
        return jvm as unknown as ChildProcess;
      });
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      install();
      await expectCleanFailure("--no-docker: WireMock exited during start-up (SIGKILL)");
    });

    it("times out, with WireMock's output, and kills the JVM", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      vi.mocked(spawn).mockImplementation(() => {
        const jvm = new FakeJvm();
        queueMicrotask(() => jvm.stdout.emit("data", Buffer.from("booting…")));
        jvms.push(jvm);
        return jvm as unknown as ChildProcess;
      });
      install({ startupTimeout: 0 });
      await expectCleanFailure("--no-docker: WireMock was not healthy within 0ms\n--- WireMock output ---\nbooting…");
      expect(jvms[0].kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("times out without output", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      install({ startupTimeout: 0 });
      await expectCleanFailure(/^--no-docker: WireMock was not healthy within 0ms$/u);
    });

    it("removes the temp directory when a source cannot be materialised", async () => {
      install();
      const container = new WiremockContainer().withCopyFilesToContainer([{ source: "./does-not-exist.json", target: "/home/wiremock/__files/x.json" }]);
      await expectCleanFailure("ENOENT", container);
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe("fast start: a class-data archive cached per JAR and Java", () => {
    let cacheDir: string;
    const archives = (): string[] => readdirSync(cacheDir).toSorted();

    beforeEach(() => {
      cacheDir = mkdtempSync(join(tmpdir(), "wiremock-cds-"));
    });

    afterEach(async () => {
      await Promise.all(started.map((container) => container.stop())); // JVMs write their recordings first
      rmSync(cacheDir, { recursive: true, force: true });
    });

    it("records the archive on the first run and publishes it atomically at a graceful stop", async () => {
      install({ cacheDir });
      const container = await start();
      const recording = flag(0, "ArchiveClassesAtExit") ?? "";
      expect(recording).toMatch(new RegExp(`^${cacheDir}/wiremock-[0-9a-f]{16}\\.jsa\\.[0-9a-f-]{36}\\.tmp$`, "u"));

      await container.stop();

      expect(jvms[0].kill).toHaveBeenCalledExactlyOnceWith("SIGTERM"); // HotSpot writes the archive only on a graceful exit
      expect(archives()).toEqual([basename(recording.replace(/\.[^.]+\.tmp$/u, ""))]);
    });

    it("uses the archive on later runs, which stop instantly", async () => {
      install({ cacheDir });
      await (await start()).stop();
      const [archive] = archives();

      await (await start()).stop();

      expect(flag(1, "SharedArchiveFile")).toBe(join(cacheDir, archive));
      expect(flag(1, "ArchiveClassesAtExit")).toBeUndefined();
      expect(jvms[1].kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    });

    it("keys the archive by JAR and Java, so neither ever loads a foreign one", async () => {
      install({ cacheDir });
      await (await start()).stop();
      install({ cacheDir, java: "/other/jdk/bin/java" });
      await (await start()).stop();
      expect(archives()).toHaveLength(2);
    });

    it("drops an archive the JVM rejects as stale, so the next run records a fresh one", async () => {
      install({ cacheDir });
      await (await start()).stop();
      vi.mocked(spawn).mockImplementationOnce((_java, args) => {
        const jvm = new FakeJvm(args as string[]);
        queueMicrotask(() => jvm.stdout.emit("data", Buffer.from("[0.172s][warning][cds,dynamic] Unable to use shared archive.\n")));
        jvms.push(jvm);
        return jvm as unknown as ChildProcess;
      });
      const container = await start();
      expect(archives()).toEqual([]);
      await container.stop();
      await start();
      expect(flag(2, "ArchiveClassesAtExit")).toBeDefined();
    });

    it("discards a recording cut short by SIGKILL after 10 s – only complete archives are published", async () => {
      install({ cacheDir });
      const container = await start();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      jvms[0].ignoreSigterm = true;
      const stopping = container.stop();
      await vi.advanceTimersByTimeAsync(10_000);
      await stopping;
      expect(jvms[0].kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
      expect(archives()).toEqual([]);
    });

    it("discards the recording of a JVM that crashes instead of exiting gracefully", async () => {
      install({ cacheDir });
      const container = await start();
      const recording = flag(0, "ArchiveClassesAtExit") ?? "";
      jvms[0].kill.mockImplementationOnce(() => {
        writeFileSync(recording, "half-written"); // the JVM died mid-dump
        jvms[0].exit(134); // SIGABRT-style crash exit
        return true;
      });
      await container.stop();
      expect(archives()).toEqual([]);
    });

    it("survives losing the race to publish – the recording is cleaned up", async () => {
      install({ cacheDir });
      const container = await start();
      const recording = flag(0, "ArchiveClassesAtExit") ?? "";
      mkdirSync(join(recording.replace(/\.[^.]+\.tmp$/u, ""), "occupied"), { recursive: true }); // rename onto a non-empty directory fails
      await expect(container.stop()).resolves.toBeDefined();
      expect(existsSync(recording)).toBe(false);
    });

    it("removes recordings abandoned over an hour ago (e.g. Ctrl-C), keeping younger ones", async () => {
      const abandoned = join(cacheDir, "wiremock-0000000000000000.jsa.old.tmp");
      const inProgress = join(cacheDir, "wiremock-0000000000000000.jsa.new.tmp");
      writeFileSync(abandoned, "");
      writeFileSync(inProgress, "");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      utimesSync(abandoned, twoHoursAgo, twoHoursAgo);
      install({ cacheDir });
      await start();
      expect(existsSync(abandoned)).toBe(false);
      expect(existsSync(inProgress)).toBe(true);
    });

    it("starts without an archive when the cache is unusable or disabled", async () => {
      const notADirectory = join(cacheDir, "file");
      writeFileSync(notADirectory, "");
      install({ cacheDir: notADirectory });
      await (await start()).stop();
      install({ cacheDir: false });
      await (await start()).stop();
      for (const index of [0, 1]) {
        expect(spawnCall(index).args.some((arg) => /Archive/u.test(arg))).toBe(false);
        expect(jvms[index].kill).toHaveBeenCalledWith("SIGKILL");
      }
    });

    it("caches below the OS temp directory by default", async () => {
      uninstall = installNoDockerRuntime({ env, log, java: "/unit-test/java" }); // a key no real run shares
      const container = await start();
      const recording = flag(0, "ArchiveClassesAtExit") ?? "";
      expect(dirname(recording)).toBe(join(tmpdir(), "wiremock-testcontainers"));
      await container.stop();
      rmSync(recording.replace(/\.[^.]+\.tmp$/u, ""), { force: true });
    });
  });

  describe("the container stand-in", () => {
    let container: StartedWiremockContainer;

    beforeEach(async () => {
      install();
      container = await start(new WiremockContainer().withName("payments-mock"));
    });

    it("answers inspection calls like a container with port 8080 mapped", () => {
      const port = Number(new URL(container.rpcUrl).port);
      expect(container.getHost()).toBe("127.0.0.1");
      expect(container.getHostname()).toBe("payments-mock");
      expect(container.getName()).toBe("payments-mock");
      expect(container.getFirstMappedPort()).toBe(port);
      expect(container.getMappedPort(8080)).toBe(port);
      expect(container.getMappedPort("8080/tcp")).toBe(port);
      expect(container.getId()).toMatch(/^no-docker-[0-9a-f-]{36}$/u);
      expect(container.getLabels()).toEqual({});
      expect(container.getNetworkNames()).toEqual([]);
    });

    it("defaults the name to one derived from the port", async () => {
      const unnamed = await start();
      expect(unnamed.getName()).toBe(`wiremock-no-docker-${new URL(unnamed.rpcUrl).port}`);
    });

    it("has no other ports", () => {
      expect(() => container.getMappedPort(9090)).toThrow('No port mapping found for "9090/tcp"');
      expect(() => container.getMappedPort(8080, "udp")).toThrow('No port mapping found for "8080/udp"');
    });

    it("throws a clear error for container-only features", async () => {
      const message = "is not supported with --no-docker: WireMock runs as a local JVM process, not in a container";
      expect(() => container.getNetworkId("bridge")).toThrow(`getNetworkId() ${message}`);
      expect(() => container.getIpAddress("bridge")).toThrow(`getIpAddress() ${message}`);
      await expect(container.exec(["ls"])).rejects.toThrow(`exec() ${message}`);
      await expect(container.commit({ repo: "x", tag: "y" })).rejects.toThrow(`commit() ${message}`);
      await expect(container.copyArchiveFromContainer("/")).rejects.toThrow(`copyArchiveFromContainer() ${message}`);
      await expect(container.copyArchiveToContainer(Readable.from([]))).rejects.toThrow(`copyArchiveToContainer() ${message}`);
      await expect(container.copyDirectoriesToContainer([])).rejects.toThrow(`copyDirectoriesToContainer() ${message}`);
      await expect(container.copyFilesToContainer([])).rejects.toThrow(`copyFilesToContainer() ${message}`);
      await expect(container.copyContentToContainer([])).rejects.toThrow(`copyContentToContainer() ${message}`);
    });

    it("serves WireMock's captured output as logs()", async () => {
      jvms[0].stdout.emit("data", Buffer.from("Request received: GET /cards\n"));
      expect(await text(await container.logs())).toBe("Request received: GET /cards\n");
    });

    it("stop() kills the JVM at once – a test double has no state worth a graceful shutdown – and removes its files", async () => {
      const { home } = spawnCall();
      const stopped = await container.stop();
      expect(jvms[0].kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
      expect(existsSync(home)).toBe(false);
      expect(stopped.getId()).toBe(container.getId());
      await expect(stopped.copyArchiveFromContainer("/")).rejects.toThrow("copyArchiveFromContainer() is not supported with --no-docker");
      await container.stop(); // idempotent
      expect(jvms[0].kill).toHaveBeenCalledTimes(1);
    });

    it("restart() relaunches the JVM on the same port and files", async () => {
      await container.restart();
      expect(jvms).toHaveLength(2);
      expect(jvms[0].kill).toHaveBeenCalledWith("SIGKILL");
      expect(spawnCall(1).args).toEqual(spawnCall(0).args);
      expect(existsSync(spawnCall(1).home)).toBe(true);
    });

    it("stops on async dispose (`await using`), wrapped or not", async () => {
      await container[Symbol.asyncDispose]();
      expect(jvms[0].kill).toHaveBeenCalledWith("SIGKILL");

      const request = { image: "wiremock/wiremock:latest", command: [], environment: {}, directories: [], files: [], contents: [] };
      const raw = await getRuntime()?.start(request);
      await raw?.[Symbol.asyncDispose]();
      expect(jvms[1].kill).toHaveBeenCalledWith("SIGKILL");
    });
  });
});

describe("WiremockContainer.start() runtime seam", () => {
  afterEach(() => setRuntime(undefined));

  it("hands a registered runtime the builder's full configuration instead of starting Docker", async () => {
    const docker = vi.spyOn(GenericContainer.prototype, "start");
    const started = { getHost: () => "10.0.0.1", getMappedPort: () => 1234 };
    const runtime = { start: vi.fn<(request: WiremockStartRequest) => Promise<never>>(async () => started as never) };
    setRuntime(runtime);

    const container = await new WiremockContainer("wiremock/wiremock:3.13.0")
      .withName("seam")
      .withCommand(["--verbose"])
      .withEnvironment({ A: "b" })
      .withMappings(ABSOLUTE.fixtureDir)
      .withMapping("ping", { json: '{"request":{"url":"/ping"},"response":{"status":200}}' })
      .withFiles(ABSOLUTE.greeting)
      .start();

    expect(docker).not.toHaveBeenCalled();
    expect(container.rpcUrl).toBe("http://10.0.0.1:1234");
    expect(runtime.start).toHaveBeenCalledExactlyOnceWith({
      image: "wiremock/wiremock:3.13.0",
      name: "seam",
      command: ["--verbose"],
      environment: { A: "b" },
      directories: [
        { source: join(ABSOLUTE.fixtureDir, "mappings"), target: "/home/wiremock/mappings" },
        { source: join(ABSOLUTE.fixtureDir, "__files"), target: "/home/wiremock/__files" },
      ],
      files: [{ source: ABSOLUTE.greeting, target: "/home/wiremock/__files/greeting.txt" }],
      contents: [{ content: '{"request":{"url":"/ping"},"response":{"status":200}}', target: "/home/wiremock/mappings/ping.json" }],
    });
    docker.mockRestore();
  });

  it("uses Docker again once the runtime is cleared", () => {
    setRuntime({ start: vi.fn<() => Promise<never>>() });
    setRuntime(undefined);
    expect(getRuntime()).toBeUndefined();
  });
});
