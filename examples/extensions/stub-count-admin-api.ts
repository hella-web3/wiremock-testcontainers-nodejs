import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { JavaExtension } from "./java-extension";
import { JARS, JAVA_PACKAGE } from "./jars";

/** What the admin client needs of a started container – a fake suffices in unit tests. */
export type AdminApi = Pick<StartedWiremockContainer, "getAdminUrl">;

/**
 * Admin API extension (https://wiremock.org/docs/extensibility/admin-api-extensions/): adds
 * `GET /__admin/stub-count`, answering `{ "count": <number of stubs> }`.
 */
export class StubCountAdminApi extends JavaExtension {
  /** WireMock's name for it. */
  static readonly NAME = "stub-count";
  /** The route it adds below `/__admin`. */
  static readonly ROUTE = "/stub-count";

  constructor() {
    super({ name: StubCountAdminApi.NAME, className: `${JAVA_PACKAGE}.StubCountAdminApi`, jar: JARS.examples });
  }

  /**
   * Calls the route: the number of stubs WireMock serves.
   * @throws If the route fails – e.g. because the extension is not registered.
   */
  static async count(wiremock: AdminApi): Promise<number> {
    const url = `${wiremock.getAdminUrl()}${StubCountAdminApi.ROUTE}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} failed with ${response.status} – is StubCountAdminApi registered?`);
    const { count } = (await response.json()) as { count: number };
    return count;
  }
}
