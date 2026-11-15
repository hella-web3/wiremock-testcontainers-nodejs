# Releasing

How the library is released, and how its [documentation](https://hella-web3.github.io/wiremock-testcontainers-nodejs/)
follows – especially through major versions. For how every change keeps the docs up to date, see
[CONTRIBUTING.md → Keeping the docs in step](./CONTRIBUTING.md#keeping-the-docs-in-step-with-the-library).

## How the docs follow the library

- **The site is built from `main`.** `docs.yml` deploys it on every change to `docs/`, `examples/`,
  `src/`, `README.md` or `package.json` – no release step publishes docs. Since every change merges
  with its docs ([definition of done](./CONTRIBUTING.md#definition-of-done)), `main`'s docs
  describe `main`'s code.
- **One docs version per major.** The current docs – `docs/docs/` – document the major in
  `package.json`; earlier majors are frozen copies in `docs/versioned_docs/`, with their code
  inlined and source links pinned to their last release tag.
- **`package.json`'s version decides what the site shows:**

| `package.json` | `/docs` | Also on the site |
|----------------|---------|------------------|
| `0.4.1` – a release | `0.x`, the current docs | – |
| `1.0.0-next.2` – the next major, in development | `0.x`, the latest released major (frozen copy) | `/docs/next`: `1.x (next)`, the current docs, with an "unreleased" banner |
| `1.0.0` – released | `1.x`, the current docs | `/docs/0.x`: the frozen `0.x` docs |

Between merging a user-visible change and releasing it, the docs run ahead of npm: release soon
after merging. Breaking changes never run ahead – they wait in `/docs/next` until their major is
released.

## Patch and minor releases

```bash
pnpm version patch               # or minor – commits the version and tags it, e.g. v0.4.2
git push --follow-tags
```

`npx np --no-publish` does the same interactively.

1. The `v*` tag runs `release.yml`, which creates the GitHub release with generated notes.
2. Run `publish.yml` (Actions → *Publish to NPM*): it verifies, builds and publishes to npm with
   provenance, and mirrors to GitHub Packages.
3. Docs: nothing to do. They were deployed when the changes merged; the version commit redeploys
   them unchanged – the major, and so the label, stays the same.

## Major releases

A major version goes through three steps: **open** it with its first breaking change,
**develop** it on `main`, **release** it.

### 1. Open the next major – with the first breaking change

In the pull request making the first breaking change – before it touches the current docs – freeze
the docs of the current major and mark `main` as the next major's pre-release:

```bash
pnpm docs:version:cut                                   # freezes the 0.x docs – source links at v0.4.1
npm version premajor --preid next --no-git-tag-version  # 0.4.1 → 1.0.0-next.0, no commit, no tag
```

`docs:version:cut` (in `docs/`: `npm run version:cut`) regenerates the API reference, snapshots
docs and sidebars as `versioned_docs/version-0.x`, inlines every example snippet – `main`'s
examples will change – and pins source links to `v0.4.1`. Commit `docs/versions.json`,
`docs/versioned_docs/`, `docs/versioned_sidebars/` and `package.json` with the breaking change.

- **Release pending changes first.** The snapshot is taken from `main` and linked to the last
  release's tag: if `main` has unreleased `0.x` changes, release them as a patch or minor first, so
  that both agree.
- **Both steps or neither.** The docs' tests fail when `0.x` is cut but `package.json` is still at
  `0.4.1`, and when it reaches `1.x` without a `0.x` snapshot – each with the command that fixes it.
- Explicit form, e.g. after the fact: `pnpm docs:version:cut 0.x --ref v0.4.1`. During the
  pre-release the script requires it: its defaults would freeze the unreleased docs.

From the next deployment on, `/docs` keeps showing `0.x` – the released version – and the updated
current docs appear at `/docs/next` as `1.x (next)`.

### 2. Develop the major on `main`

- **Breaking changes update the current docs** like any change – guides, examples, JSDoc, the API
  overview – and list themselves in a migration guide: a page in `docs/docs/` (e.g.
  `migrating-from-0.x.mdx`) naming each change and the code to change.
- **Only the first breaking change cuts a version**; later ones just update the current docs.
- **Do not publish the pre-release** with `publish.yml`: it publishes to npm's `latest` tag, so it
  refuses versions like `1.0.0-next.0`.
- **Corrections to the `0.x` docs** go into `docs/versioned_docs/version-0.x/` directly – a frozen
  copy has no snippets to fill, so edit its code blocks in place.

### 3. Release the major

```bash
pnpm version major               # 1.0.0-next.2 → 1.0.0 – commits and tags v1.0.0
git push --follow-tags
```

Then, as for any release, `release.yml` creates the GitHub release and `publish.yml` publishes it.
The version commit redeploys the docs: `1.x` becomes the default at `/docs`, the frozen `0.x` docs
move to `/docs/0.x`, and `/docs/next` is gone. Nothing else changes in the docs project.

### Maintaining an older major

Fixes to `0.x` after `1.0.0` are released from a branch off the last `v0.*` tag. Their docs are
the frozen `versioned_docs/version-0.x/` on `main`: update those pages in the pull request to
`main` that accompanies the fix.

Careful: `publish.yml` publishes to npm's `latest` tag, which would make the `0.x` fix what
`npm install` resolves to. Publish older majors under their own tag instead – e.g.
`pnpm publish --tag v0-latest` – and adapt the workflow before the first such release.

## Workflows

| Workflow | Runs on | Does |
|----------|---------|------|
| `main.yml` | Pull requests, pushes to `main` | The quality gate: library, examples, docs |
| `docs-required.yml` | Pull requests | Fails `src/` changes without `docs/` or `examples/` changes, unless labelled `no-docs-needed` |
| `docs.yml` | Pushes to `main` touching the docs' inputs; manual | Verifies and builds the site, deploys it to GitHub Pages |
| `release.yml` | `v*` tags | Creates the GitHub release |
| `publish.yml` | Manual | Verifies, builds and publishes to npm and GitHub Packages; refuses pre-releases |
| `size.yml` | Pull requests | Keeps the published tarball within its budget |
