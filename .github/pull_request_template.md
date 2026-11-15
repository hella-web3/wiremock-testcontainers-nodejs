## What and why

<!-- The change, and the problem it solves. Link the issue: "Closes #…". -->

## Definition of done

See [CONTRIBUTING.md → Definition of done](../CONTRIBUTING.md#definition-of-done).

- [ ] Tests cover the change – `pnpm test:unit --coverage` (and `pnpm test:e2e` for container behaviour)
- [ ] **Public API changed?** Its JSDoc documents it, with an `@see` link to its guide section
- [ ] **Public API changed?** An example in `examples/` uses it – unit-tested, and E2E-tested if it talks to WireMock
- [ ] **Public API changed?** A guide in `docs/docs/` explains it, embedding that example, and the [API overview](../docs/docs/reference/api-overview.mdx) lists it
- [ ] Breaking change? A migration guide entry describes it; the first one of a major also opens it – `pnpm docs:version:cut` and `npm version premajor --preid next --no-git-tag-version` ([release.md](../release.md#major-releases))
- [ ] The quality gate passes: library, `pnpm examples:unit`, `pnpm examples:e2e`, `pnpm docs:check`

<!-- Changing src/ without docs/ or examples/ fails the "Docs required" check. For changes users
cannot observe – refactorings, internal fixes – add the `no-docs-needed` label instead. -->
