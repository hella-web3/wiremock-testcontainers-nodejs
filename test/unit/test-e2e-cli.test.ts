import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Black-box tests of `scripts/test-e2e.mjs`, the `pnpm test:e2e` entry point. Only the
 * CI/CD refusal is exercised here – it exits before vitest is spawned, so no container
 * runtime or JVM is needed. Running with and without `--no-docker` is covered by
 * `pnpm test:e2e --no-docker` itself.
 */
const run = (args: string[], env: Record<string, string>) => {
  // A clean environment: neither the runner's own CI variables nor npm's config may leak in.
  const { status, stderr, stdout } = spawnSync(process.execPath, ["scripts/test-e2e.mjs", ...args], {
    env: { PATH: process.env.PATH ?? "", NO_COLOR: "1", ...env },
    encoding: "utf8",
  });
  return { status, stderr, stdout };
};

/** The `CI_VARIABLES` array literal of `file`. */
const ciVariables = (file: string): unknown =>
  JSON.parse((/const CI_VARIABLES = (\[[^\]]*\])/u.exec(readFileSync(file, "utf8"))?.[1] ?? "null").replace(/,\s*\]$/u, "]"));

describe("pnpm test:e2e --no-docker", () => {
  it.each([
    ["CI", "true"],
    ["GITHUB_ACTIONS", "true"],
    ["GITLAB_CI", "true"],
    ["JENKINS_URL", "https://jenkins.example"],
  ])("refuses to run when %s=%s – CI/CD must always use Docker", (name, value) => {
    const { status, stderr, stdout } = run(["--no-docker"], { [name]: value });
    expect(status).toBe(1);
    expect(stderr).toContain(`✖ --no-docker is not allowed in CI/CD (detected ${name}=${value}). Run the E2E suite with Docker.`);
    expect(stdout).toBe(""); // vitest was never started
  });

  it("also refuses the npm form `npm run test:e2e --no-docker`, where npm swallows the flag", () => {
    const { status, stderr } = run([], { npm_config_docker: "", CI: "true" });
    expect(status).toBe(1);
    expect(stderr).toContain("--no-docker is not allowed in CI/CD");
  });

  it("recognises exactly the CI/CD variables the harness refuses", () => {
    expect(ciVariables("scripts/test-e2e.mjs")).toEqual(ciVariables("src/no-docker.ts"));
  });

  it("refuses after a forwarded `--` separator (`pnpm test:e2e -- --no-docker`)", () => {
    const { status, stderr } = run(["--", "--no-docker"], { CI: "1" });
    expect(status).toBe(1);
    expect(stderr).toContain("--no-docker is not allowed in CI/CD (detected CI=1)");
  });
});
