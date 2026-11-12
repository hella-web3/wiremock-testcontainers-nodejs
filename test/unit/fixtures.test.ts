import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jarEntries, jarEntry } from "../../src/jar";
import { listFiles } from "../../src/sources";
import {
  expectAccountBalanceResponse,
  expectCardsResponse,
  expectErrorResponse,
  expectMapping,
} from "../helpers/assertions";
import { CLASSES, EXAMPLE_JAR, EXTENSION_FIXTURE_DIR, POWERED_BY_JAR } from "../helpers/extensions";
import {
  type AccountBalanceResponse,
  type CardsResponse,
  type ErrorResponse,
  FILES_DIR,
  findMapping,
  isErrorMapping,
  listBodyFiles,
  listMappingFiles,
  loadAllMappings,
  MAPPINGS_DIR,
  requestHeaders,
} from "../helpers/fixtures";

/**
 * Static checks over the recorded WireMock session in `test/__mocks__/wiremock`.
 * Runs without Docker and guards against fixture drift: a mapping pointing at
 * a missing body file, an orphaned body file, or a payload whose shape no
 * longer matches the schemas the E2E suite asserts against.
 */
describe("WireMock fixtures: test/__mocks__/wiremock", () => {
  const loaded = loadAllMappings();

  describe("directory layout", () => {
    it("has one mapping and one body file per recorded endpoint", () => {
      expect(existsSync(MAPPINGS_DIR)).toBe(true);
      expect(existsSync(FILES_DIR)).toBe(true);
      expect(listMappingFiles()).toEqual([
        "mapping-account-balance-server-error-500.json",
        "mapping-account-balance-zstDt.json",
        "mapping-cards-FA6eA.json",
        "mapping-cards-bad-request-400.json",
      ]);
      expect(listBodyFiles()).toEqual([
        "body-account-balance-server-error-500.json",
        "body-account-balance-zstDt.json",
        "body-cards-FA6eA.json",
        "body-cards-bad-request-400.json",
      ]);
    });
  });

  describe("mapping ↔ body file consistency", () => {
    it.each(loaded)("$fileName is a well-formed JSON GET stub", ({ mapping, body }) => {
      expectMapping(mapping);
      expect(mapping.request.method).toBe("GET");
      expect(mapping.response.headers["Content-Type"]).toBe("application/json; charset=utf-8");
      expect(existsSync(join(FILES_DIR, mapping.response.bodyFileName))).toBe(true);
      expect(body).toEqual(expect.any(Object));
    });

    it("references every body file exactly once, with unique ids and routes", () => {
      const referenced = loaded.map(({ mapping }) => mapping.response.bodyFileName).toSorted();
      const ids = new Set(loaded.map(({ mapping }) => mapping.id));
      const routes = new Set(
        loaded.map(({ mapping }) => `${mapping.request.method} ${mapping.request.url} → ${mapping.response.status}`),
      );
      expect(referenced).toEqual(listBodyFiles());
      expect(ids.size).toBe(loaded.length);
      expect(routes.size).toBe(loaded.length);
    });

    it("gives error stubs that shadow a recorded URL a higher priority than WireMock's default (5)", () => {
      const recordedUrls = new Set(loaded.filter((m) => !isErrorMapping(m)).map(({ mapping }) => mapping.request.url));
      const shadowing = loaded.filter((m) => isErrorMapping(m) && recordedUrls.has(m.mapping.request.url));
      expect(shadowing.map(({ fileName }) => fileName)).toEqual(["mapping-account-balance-server-error-500.json"]);
      expect(shadowing.every(({ mapping }) => (mapping.priority ?? 5) < 5)).toBe(true);
    });

    it("findMapping() fails loudly for an unknown route", () => {
      expect(() => findMapping("GET", "/does-not-exist")).toThrow(
        "No mapping found for GET /does-not-exist → 200",
      );
    });
  });

  describe("GET /cards → body-cards-FA6eA.json", () => {
    const cards = findMapping<CardsResponse>("GET", "/cards").body;

    it("has every field populated and matching the cards schema", () => {
      expectCardsResponse(cards);
    });

    it("contains the six recorded cards on a single page", () => {
      expect(cards.meta).toStrictEqual({ totalItems: 6, itemCount: 6, itemsPerPage: 10, totalPages: 1, currentPage: 1 });
      expect(cards.items.map(({ id, cardName, last4 }) => [id, cardName, last4])).toEqual([
        ["57590f13-c0b9-496d-b3ef-b82758b4d583", "Test User3", "1730"],
        ["6b413690-f559-4c97-b5ea-877136030086", "Test User2", "8377"],
        ["aa2a96a3-c1ad-4ea3-9b86-2abd47f3cc22", "Test User2", "8454"],
        ["70b7b08f-0b15-4c9c-9183-1afe88e8f78f", "Test User4", "9162"],
        ["507e7dd7-5c8f-480f-9cf3-2500ae807e16", "Test User4", "1213"],
        ["8b15cddc-c638-49bb-89a7-8f7ed3048351", "string", "7860"],
      ]);
    });
  });

  describe("GET /account/balance → body-account-balance-zstDt.json", () => {
    const balance = findMapping<AccountBalanceResponse>("GET", "/account/balance").body;

    it("has every field populated and matching the account balance schema", () => {
      expectAccountBalanceResponse(balance);
    });

    it("contains the recorded balances", () => {
      expect(balance).toStrictEqual({ availableBalance: 1_000_000, availableToAllocate: 1_000_000 });
    });
  });

  describe("error stubs (4xx / 5xx)", () => {
    it.each(loaded.filter(isErrorMapping))(
      "$fileName serves a well-formed $mapping.response.status error envelope",
      ({ mapping, body }) => {
        expectErrorResponse(body as ErrorResponse, mapping.response.status);
      },
    );

    it("GET /cards?page=0 → 400 Bad Request explains the validation failure", () => {
      const { mapping, body } = findMapping<ErrorResponse>("GET", "/cards?page=0", 400);
      expect(requestHeaders(mapping)).toStrictEqual({});
      expect(body).toStrictEqual({
        statusCode: 400,
        error: "Bad Request",
        message: "page must be a positive integer",
      });
    });

    it("GET /account/balance → 500 is triggered by the X-Mock-Scenario header", () => {
      const { mapping, body } = findMapping<ErrorResponse>("GET", "/account/balance", 500);
      expect(requestHeaders(mapping)).toStrictEqual({ "X-Mock-Scenario": "server-error" });
      expect(body).toStrictEqual({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Internal server error",
      });
    });
  });
});

/** The compiled classes and resources a fixture JAR is packed from, as `/`-separated paths. */
const classFiles = (jar: string): string[] => listFiles(join(EXTENSION_FIXTURE_DIR, jar.replace(/\.jar$/u, ""), "classes")).toSorted();

/** Files below `dir` whose name ends in `suffix` – the project's own: `node_modules` is never entered. */
const filesEndingIn = (dir: string, suffix: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : filesEndingIn(path, suffix);
    return entry.name.endsWith(suffix) ? [path] : [];
  });

/**
 * The committed extension JARs against the compiled classes they are packed from
 * (`pnpm build:extensions` repacks them with Node.js alone): a class missing from its JAR, a JAR
 * or `examples/` copy out of date, or bytecode newer than WireMock 3's Java 11 fails here.
 */
describe("WireMock extension fixtures: test/__mocks__/extensions", () => {
  const jars = readdirSync(EXTENSION_FIXTURE_DIR).filter((file) => file.endsWith(".jar"));

  it("has one JAR per classes directory", () => {
    expect(jars).toEqual(["example-extensions.jar", "powered-by-extension.jar"]);
  });

  it.each(jars)("%s holds a manifest and exactly its classes directory, byte for byte", (jar) => {
    const bytes = readFileSync(join(EXTENSION_FIXTURE_DIR, jar));
    const classes = classFiles(jar);
    expect(jarEntries(bytes).map(({ name }) => name)).toEqual(["META-INF/MANIFEST.MF", ...classes]);
    const packed = Object.fromEntries(classes.map((file) => [file, jarEntry(bytes, file)]));
    const compiled = Object.fromEntries(classes.map((file) => [file, readFileSync(join(EXTENSION_FIXTURE_DIR, jar.replace(/\.jar$/u, ""), "classes", file))]));
    expect(packed).toEqual(compiled);
  });

  it.each(filesEndingIn(EXTENSION_FIXTURE_DIR, ".class"))("%s is Java 11 bytecode – WireMock 3 runs on Java 11+", (file) => {
    const bytes = readFileSync(file);
    expect(bytes.readUInt32BE(0)).toBe(0xca_fe_ba_be);
    expect(bytes.readUInt16BE(6)).toBe(55); // class file major version of Java 11
  });

  it("loads PoweredByTransformer by scanning, and the example extensions only by class name", () => {
    const service = "META-INF/services/com.github.tomakehurst.wiremock.extension.Extension";
    expect(jarEntry(readFileSync(POWERED_BY_JAR), service)?.toString().trim()).toBe(CLASSES.poweredBy);
    expect(jarEntry(readFileSync(EXAMPLE_JAR), service)).toBeUndefined();
  });

  it("`pnpm build:extensions --check`: the JARs and their examples/ copies are up to date", () => {
    const { status, stdout, stderr } = spawnSync(process.execPath, ["scripts/build-extensions.mjs", "--check"], { encoding: "utf8" });
    expect(stderr).toBe("");
    expect(stdout).toContain("extension JARs are up to date");
    expect(status).toBe(0);
  });

  it("holds no Java source – extensions ship compiled, so the project needs no JDK", () => {
    expect(["src", "test", "scripts", "examples"].flatMap((dir) => filesEndingIn(dir, ".java"))).toEqual([]);
  });
});
