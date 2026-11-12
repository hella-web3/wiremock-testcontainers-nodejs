/**
 * The stub-mapping fields extensions are applied with – spread them into a stub's `request` or
 * `response`, so tests never hand-write an extension's name or parameters.
 */

/** Added to a stub's `response`: the transformers to run and their parameters. */
export interface TransformerFields<Parameters extends object = object> {
  readonly transformers: readonly string[];
  readonly transformerParameters?: Parameters;
}

/** Added to a stub's `request`: a custom matcher and its parameters. */
export interface CustomMatcherFields<Parameters extends object = object> {
  readonly customMatcher: { readonly name: string; readonly parameters: Parameters };
}
