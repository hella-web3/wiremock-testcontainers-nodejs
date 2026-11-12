import { JavaExtension } from "./java-extension";
import { JARS, JAVA_PACKAGE } from "./jars";
import type { TransformerFields } from "./stubs";

/** Parameters of {@link UppercaseTransformer}, set per stub. */
export interface UppercaseParameters {
  /** Appended to the upper-cased body. */
  readonly suffix?: string;
}

/**
 * Response transformer (https://wiremock.org/docs/extensibility/transforming-responses/): a stub
 * that opts in gets an upper-cased body, an optional suffix and `X-Transformed-By: uppercase`.
 */
export class UppercaseTransformer extends JavaExtension {
  /** WireMock's name for it – what stubs list in `transformers`. */
  static readonly NAME = "uppercase";
  /** The response header it adds. */
  static readonly HEADER = "X-Transformed-By";

  constructor() {
    super({ name: UppercaseTransformer.NAME, className: `${JAVA_PACKAGE}.UppercaseTransformer`, jar: JARS.examples });
  }

  /**
   * `response` fields applying the transformer.
   * @example response: { status: 200, body: "ok", ...UppercaseTransformer.transform({ suffix: "!" }) }
   */
  static transform(parameters: UppercaseParameters = {}): TransformerFields<UppercaseParameters> {
    return {
      transformers: [UppercaseTransformer.NAME],
      ...(parameters.suffix === undefined ? {} : { transformerParameters: { suffix: parameters.suffix } }),
    };
  }
}
