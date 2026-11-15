import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".xml": "application/xml" };

/** The file GitHub Pages serves for `path` below the site root: `path`, `path.html` or `path/index.html`. */
export function resolveFile(root: string, path: string): string | undefined {
  const base = normalize(join(root, decodeURIComponent(path)));
  if (!base.startsWith(root)) return undefined;
  return [base, `${base}.html`, join(base, "index.html")].find((file) => existsSync(file) && statSync(file).isFile());
}

/** Serves the built site at `baseUrl`, like GitHub Pages; resolves to its origin and a closer. */
export async function serve(root: string, baseUrl: string): Promise<{ readonly origin: string; close(): Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const file = pathname.startsWith(baseUrl) ? resolveFile(root, pathname.slice(baseUrl.length)) : undefined;
    response.writeHead(file ? 200 : 404, { "Content-Type": TYPES[extname(file ?? ".html")] ?? "application/octet-stream" });
    response.end(readFileSync(file ?? join(root, "404.html")));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
