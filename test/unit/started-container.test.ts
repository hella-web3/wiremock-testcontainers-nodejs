import type { StartedTestContainer } from "testcontainers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RecordedRequest, StartedWiremockContainer } from "../../src";

const HOST = "127.0.0.1";
const MAPPED_PORT = 41234;
const RPC_URL = `http://${HOST}:${MAPPED_PORT}`;
const ADMIN_URL = `${RPC_URL}/__admin`;
const HEALTH_URL = `${ADMIN_URL}/health`;
const MAPPINGS_URL = `${ADMIN_URL}/mappings`;

/**
 * Unit tests for the test-utility API of {@link StartedWiremockContainer}.
 * They run without Docker: the only thing stubbed is the global `fetch`, the
 * single call that talks to WireMock's admin API. URL building, health-check
 * fallbacks, polling, lifecycle resets and journal queries are exercised for
 * real, including their error paths.
 */

/** Minimal fake of the underlying started container – the admin API never touches it. */
const fakeStartedContainer = (): StartedTestContainer =>
  ({
    getHost: vi.fn<() => string>(() => HOST),
    getMappedPort: vi.fn<() => number>(() => MAPPED_PORT),
    stop: vi.fn<() => Promise<object>>(async () => ({})),
  }) as unknown as StartedTestContainer;

/** A `fetch`-compatible JSON response. */
const json = (body: unknown, status = 200, statusText = ""): Response =>
  new Response(JSON.stringify(body), { status, statusText, headers: { "Content-Type": "application/json" } });

describe("StartedWiremockContainer test utilities", () => {
  let container: StartedWiremockContainer;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    container = new StartedWiremockContainer(fakeStartedContainer(), RPC_URL);
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("getUrl()", () => {
    it.each([
      [undefined, RPC_URL],
      ["", RPC_URL],
      ["/cards", `${RPC_URL}/cards`],
      ["cards", `${RPC_URL}/cards`],
      ["/cards?page=1&limit=10", `${RPC_URL}/cards?page=1&limit=10`],
      ["account/balance", `${RPC_URL}/account/balance`],
      ["?page=1", `${RPC_URL}?page=1`],
    ])("getUrl(%j) → %s – no string formatting needed in tests", (path, expected) => {
      expect(container.getUrl(path)).toBe(expected);
    });
  });

  describe("getAdminUrl() and getMappingUrl()", () => {
    it("exposes the admin API base URL", () => {
      expect(container.getAdminUrl()).toBe(ADMIN_URL);
    });

    it("exposes the stub-mappings admin endpoint", () => {
      expect(container.getMappingUrl()).toBe(MAPPINGS_URL);
    });
  });

  describe("isRunning()", () => {
    it("is true when the health endpoint responds 200", async () => {
      fetchMock.mockResolvedValueOnce(json({ status: "healthy" }));
      await expect(container.isRunning()).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(HEALTH_URL);
    });

    it("is false when the health endpoint reports unhealthy", async () => {
      fetchMock.mockResolvedValueOnce(json({ status: "unhealthy" }, 500));
      await expect(container.isRunning()).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("falls back to the mappings endpoint on images without /__admin/health", async () => {
      fetchMock.mockResolvedValueOnce(json("Not found", 404)).mockResolvedValueOnce(json({ mappings: [] }));
      await expect(container.isRunning()).resolves.toBe(true);
      expect(fetchMock).toHaveBeenNthCalledWith(1, HEALTH_URL);
      expect(fetchMock).toHaveBeenNthCalledWith(2, MAPPINGS_URL);
    });

    it("is false when the fallback probe fails too", async () => {
      fetchMock.mockResolvedValueOnce(json("Not found", 404)).mockResolvedValueOnce(json("", 503));
      await expect(container.isRunning()).resolves.toBe(false);
    });

    it("is false – and never throws – when the container is unreachable", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
      await expect(container.isRunning()).resolves.toBe(false);
    });
  });

  describe("waitUntilReady()", () => {
    it("resolves on the first probe when the container is already healthy", async () => {
      fetchMock.mockResolvedValueOnce(json({ status: "healthy" }));
      await expect(container.waitUntilReady()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("polls at the configured interval until the container becomes healthy", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(json({ status: "healthy" }));

      const ready = container.waitUntilReady({ timeout: 5_000, interval: 100 });
      await vi.advanceTimersByTimeAsync(200);

      await expect(ready).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("rejects with a descriptive error when the timeout elapses", async () => {
      vi.useFakeTimers();
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));

      await Promise.all([
        expect(container.waitUntilReady({ timeout: 300, interval: 100 })).rejects.toThrow(
          `WireMock at ${RPC_URL} was not ready within 300ms`,
        ),
        vi.advanceTimersByTimeAsync(400),
      ]);
    });
  });

  describe("reset()", () => {
    it("POSTs /__admin/reset – stubs restored, journal cleared, no container restart", async () => {
      fetchMock.mockResolvedValueOnce(json({}));
      await expect(container.reset()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${ADMIN_URL}/reset`, { method: "POST" });
    });

    it("surfaces admin failures with method, path, status and detail", async () => {
      fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500, statusText: "Server Error" }));
      await expect(container.reset()).rejects.toThrow(
        "WireMock admin request POST /__admin/reset failed with 500 Server Error: boom",
      );
    });
  });

  describe("resetRequests()", () => {
    it("DELETEs /__admin/requests – journal cleared, stub configuration untouched", async () => {
      fetchMock.mockResolvedValueOnce(json({}));
      await expect(container.resetRequests()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${ADMIN_URL}/requests`, { method: "DELETE" });
    });

    it("surfaces admin failures – empty bodies do not hide the status", async () => {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 503, statusText: "Service Unavailable" }));
      await expect(container.resetRequests()).rejects.toThrow(
        "WireMock admin request DELETE /__admin/requests failed with 503 Service Unavailable",
      );
    });

    it("surfaces admin failures even when the error body cannot be read", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: () => Promise.reject(new Error("body stream already consumed")),
      } as unknown as Response);
      await expect(container.resetRequests()).rejects.toThrow(
        "WireMock admin request DELETE /__admin/requests failed with 500 Server Error",
      );
    });
  });

  describe("countRequests()", () => {
    it("POSTs the criteria as JSON and returns WireMock's count", async () => {
      fetchMock.mockResolvedValueOnce(json({ count: 3 }));
      const criteria = { method: "GET", url: "/cards" };

      await expect(container.countRequests(criteria)).resolves.toBe(3);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${ADMIN_URL}/requests/count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(criteria),
      });
    });

    it("returns 0 when nothing matched since the last reset", async () => {
      fetchMock.mockResolvedValueOnce(json({ count: 0 }));
      await expect(container.countRequests({ method: "DELETE", urlPathPattern: "/cards/.*" })).resolves.toBe(0);
    });

    it("rejects when WireMock rejects the criteria", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"errors":[]}', { status: 422, statusText: "Unprocessable Entity" }));
      await expect(container.countRequests({ urlPattern: "(" })).rejects.toThrow(
        'WireMock admin request POST /__admin/requests/count failed with 422 Unprocessable Entity: {"errors":[]}',
      );
    });
  });

  describe("findRequests()", () => {
    const recorded: RecordedRequest = {
      id: "3f62e3c4-74b9-4dbe-b5b5-6e65c600fb71",
      url: "/cards?page=1",
      absoluteUrl: `${RPC_URL}/cards?page=1`,
      method: "GET",
      headers: { Accept: "application/json" },
      body: "",
      loggedDate: 1_700_000_000_000,
    };

    it("POSTs the criteria as JSON and returns the matching journal entries", async () => {
      fetchMock.mockResolvedValueOnce(json({ requests: [recorded] }));
      const criteria = { method: "GET", urlPath: "/cards" };

      const requests = await container.findRequests(criteria);

      expect(requests).toEqual([recorded]);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${ADMIN_URL}/requests/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(criteria),
      });
    });

    it("returns an empty array when WireMock reports no matches", async () => {
      fetchMock.mockResolvedValueOnce(json({}));
      await expect(container.findRequests({ method: "PUT", url: "/nowhere" })).resolves.toEqual([]);
    });
  });
});
