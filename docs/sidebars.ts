import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * Two sidebars, like most TypeScript projects' docs: `guides` – task-oriented, from installation
 * to troubleshooting – and `api`, the reference TypeDoc generates from the library's JSDoc.
 */
const API_SIDEBAR = "./docs/api/typedoc-sidebar.cjs";
const require = createRequire(import.meta.url);

function apiItems(): SidebarsConfig[string] {
  if (!existsSync(new URL(API_SIDEBAR, import.meta.url))) {
    throw new Error(`${API_SIDEBAR} is missing: generate the API reference with "pnpm docs:api" (in docs/: "npm run api") first`);
  }
  // The generated module exports the sidebar items themselves.
  return require(API_SIDEBAR) as SidebarsConfig[string];
}

const sidebars: SidebarsConfig = {
  guides: [
    "intro",
    {
      type: "category",
      label: "Getting started",
      collapsed: false,
      items: ["getting-started/installation", "getting-started/quick-start"],
    },
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: [
        "guides/registering-stubs",
        "guides/file-sources",
        "guides/configuring-the-container",
        "guides/container-lifecycle",
        "guides/test-isolation",
        "guides/verifying-requests",
        "guides/running-without-docker",
      ],
    },
    {
      type: "category",
      label: "Extensions",
      collapsed: false,
      items: ["extensions/java-extensions", "extensions/typescript-extensions", "extensions/authoring-extensions"],
    },
    {
      type: "category",
      label: "Reference",
      collapsed: false,
      items: ["reference/api-overview", { type: "ref", id: "api/index", label: "API reference" }, "reference/troubleshooting", "reference/how-it-works"],
    },
    {
      type: "category",
      label: "Contributing",
      items: ["contributing/documentation"],
    },
  ],
  api: [{ type: "doc", id: "api/index", label: "Overview" }, ...(apiItems() as never[])],
};

export default sidebars;
