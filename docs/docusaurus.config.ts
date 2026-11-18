import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";
import exampleSnippetsPlugin from "./src/lib/docusaurus-plugin-example-snippets.mts";
import remarkExampleSnippets from "./src/lib/remark-example-snippets.mts";
import remarkLocalDocsLinks from "./src/lib/remark-local-docs-links.mts";
import {
  BASE_URL,
  CONTENT_DIR,
  DEFAULT_BRANCH,
  DOCS_ROOT,
  DOCS_URL,
  EXAMPLES_DIR,
  libraryVersion,
  NPM_URL,
  ORGANIZATION,
  PACKAGE_NAME,
  PROJECT,
  REPOSITORY_URL,
  SITE_URL,
} from "./src/lib/site.mts";
import { cutVersions, docsVersions } from "./src/lib/versions.mts";

/**
 * The docs site, deployed to GitHub Pages by `.github/workflows/docs.yml`. Its content lives in
 * `docs/`; the API reference in `docs/api/` is generated from the library's JSDoc by TypeDoc
 * (`pnpm docs:api`) and every code snippet is embedded from `../examples` at build time.
 */
/**
 * One docs version per major of the library (release.md): the current docs – `docs/` – document
 * the version in package.json, frozen copies in `versioned_docs/` the previous majors. While the
 * next major is a pre-release, the latest released major stays the default and the current docs
 * move to /docs/next.
 */
const { lastVersion, current } = docsVersions(libraryVersion(), cutVersions(DOCS_ROOT));

const config: Config = {
  title: "WireMock Testcontainers for Node.js",
  tagline: "Mock HTTP APIs in Node.js integration tests: WireMock in Testcontainers, with a fluent TypeScript API.",
  favicon: "img/logo.svg",

  // Docusaurus v4 behaviour, including Docusaurus Faster: Rspack, SWC and LightningCSS, a
  // persistent bundler cache and parallel static generation – several times faster than webpack.
  future: { v4: true },

  url: SITE_URL,
  baseUrl: BASE_URL,
  organizationName: ORGANIZATION,
  projectName: PROJECT,
  // GitHub Pages serves `/page` from `page.html`: no trailing slashes, no redirects.
  trailingSlash: false,

  // Every broken link, anchor or route fails the build.
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  onDuplicateRoutes: "throw",
  markdown: {
    hooks: { onBrokenMarkdownLinks: "throw", onBrokenMarkdownImages: "throw" },
  },

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          // Generated API pages have no source file to edit: their JSDoc lives in ../src.
          editUrl: ({ docPath, version }) =>
            docPath.startsWith("api/") || version !== "current" ? undefined : `${REPOSITORY_URL}/edit/${DEFAULT_BRANCH}/docs/docs/${docPath}`,
          lastVersion,
          versions: { current },
          remarkPlugins: [
            [remarkExampleSnippets, { examplesDir: EXAMPLES_DIR }],
            [remarkLocalDocsLinks, { docsUrl: DOCS_URL, currentPath: current.path, lastVersion }],
          ],
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  // Rebuilds pages when the examples they embed change.
  plugins: [() => exampleSnippetsPlugin({ examplesDir: EXAMPLES_DIR, contentDir: CONTENT_DIR })],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true } },
    navbar: {
      title: "WireMock Testcontainers",
      logo: { alt: "WireMock Testcontainers logo", src: "img/logo.svg" },
      items: [
        { type: "docSidebar", sidebarId: "guides", position: "left", label: "Docs" },
        { type: "docSidebar", sidebarId: "api", position: "left", label: "API" },
        { href: `${REPOSITORY_URL}/tree/${DEFAULT_BRANCH}/examples`, position: "left", label: "Examples" },
        { type: "docsVersionDropdown", position: "right" },
        { href: NPM_URL, position: "right", label: "npm" },
        { href: REPOSITORY_URL, position: "right", label: "GitHub" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Quick start", to: "/docs/getting-started/quick-start" },
            { label: "Guides", to: "/docs/guides/registering-stubs" },
            { label: "API reference", to: "/docs/api" },
            { label: "Troubleshooting", to: "/docs/reference/troubleshooting" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: REPOSITORY_URL },
            { label: "npm", href: NPM_URL },
            { label: "Issues", href: `${REPOSITORY_URL}/issues` },
            { label: "Contributing", to: "/docs/contributing/documentation" },
          ],
        },
        {
          title: "Related",
          items: [
            { label: "WireMock", href: "https://wiremock.org/docs/" },
            { label: "Testcontainers for Node.js", href: "https://node.testcontainers.org/" },
          ],
        },
      ],
      copyright: `${PACKAGE_NAME} – MIT licensed. Maintained by <a href="https://hellalabs.com/">Hella Labs</a>.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "diff"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
