import { JavaExtension } from "./java-extension";
import { JARS, JAVA_PACKAGE } from "./jars";
import type { CustomMatcherFields } from "./stubs";

/** Parameters of {@link BodyLengthMatcher}, set per stub. */
export interface BodyLengthParameters {
  /** Bodies longer than this many bytes match. */
  readonly maxLength: number;
}

/**
 * Custom request matcher (https://wiremock.org/docs/extensibility/custom-matching/): matches
 * requests whose body is longer than `maxLength` bytes.
 */
export class BodyLengthMatcher extends JavaExtension {
  /** WireMock's name for it – what stubs reference in `customMatcher`. */
  static readonly NAME = "body-too-long";

  constructor() {
    super({ name: BodyLengthMatcher.NAME, className: `${JAVA_PACKAGE}.BodyLengthMatcher`, jar: JARS.examples });
  }

  /**
   * `request` fields matching bodies longer than `maxLength` bytes.
   * @example request: { method: "POST", url: "/notes", ...BodyLengthMatcher.longerThan(20) }
   * @throws If `maxLength` is not a non-negative integer – WireMock would fail every match.
   */
  static longerThan(maxLength: number): CustomMatcherFields<BodyLengthParameters> {
    if (!Number.isInteger(maxLength) || maxLength < 0) {
      throw new RangeError(`maxLength must be a non-negative integer, got ${maxLength}`);
    }
    return { customMatcher: { name: BodyLengthMatcher.NAME, parameters: { maxLength } } };
  }
}
