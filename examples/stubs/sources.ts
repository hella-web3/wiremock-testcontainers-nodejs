/**
 * Every way to point the library at a file: `withMapping()`, `withFiles()` and
 * `withExtensionJar()` all accept these sources.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/file-sources
 */
import type { WiremockFileSource, WiremockPath, WiremockStaticFile } from "@hellaweb3/wiremock-testcontainers-nodejs";

// #region path
/** A path, relative to the working directory – where the test runner was started. */
export const HEALTH_STUB: WiremockPath = "./stubs/fixtures/health.json";
// #endregion path

// #region file-url
/** A `file:` URL – resolved against this module, so it works from any working directory. */
export const STATEMENT_STUBS: WiremockPath = new URL("./fixtures/statements.json", import.meta.url);
// #endregion file-url

// #region module
/** A file next to a module: `import.meta.url` in ES modules, `__dirname` in CommonJS. */
export const ACCOUNT_STUB: WiremockFileSource = { module: import.meta.url, file: "./fixtures/accounts.json" };
// #endregion module

// #region package
/** A file of an installed npm package – stubs shared between repositories. */
export const EXCHANGE_RATE_STUB: WiremockFileSource = {
  package: "@examples/payments-stubs",
  file: "mappings/exchange-rates.json",
};
// #endregion package

// #region static-files
/** `{ file }`; `name` sets the path below `__files/` – the base name otherwise. */
export const INVOICE_BODY: WiremockStaticFile = { file: "./stubs/fixtures/invoice.json", name: "invoices/inv-001.json" };
/** Any source works for bodies, too: this one lands at `__files/rates.json`. */
export const EXCHANGE_RATES_BODY: WiremockStaticFile = { package: "@examples/payments-stubs", file: "__files/rates.json" };
/** A plain path lands at `__files/statement.csv`. */
export const STATEMENT_BODY: WiremockStaticFile = "./stubs/fixtures/statement.csv";
// #endregion static-files
