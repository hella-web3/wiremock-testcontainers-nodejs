/**
 * The `--no-docker` wrapper, black-box: its CI/CD refusal exits before Vitest starts, so no
 * container runtime or JVM is needed. Running with and without the flag is what `npm test` does.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Runs the wrapper in a clean environment – the runner's own CI variables must not leak in. */
const run = (args: string[], env: Record<string, string>) =>
  spawnSync(process.execPath, ["scripts/test-e2e.mjs", ...args], {
    env: { PATH: process.env.PATH ?? "", NO_COLOR: "1", ...env },
    encoding: "utf8",
  });

describe("scripts/test-e2e.mjs --no-docker", () => {
  it.each([
    ["CI", "true"],
    ["GITHUB_ACTIONS", "true"],
    ["JENKINS_URL", "https://jenkins.example"],
  ])("refuses to run when %s=%s – CI/CD always uses Docker", (name, value) => {
    const { status, stderr, stdout } = run(["--no-docker"], { [name]: value });
    expect(status).toBe(1);
    expect(stderr).toContain(`✖ --no-docker is not allowed in CI/CD (detected ${name}=${value}). Run the E2E suite with Docker.`);
    expect(stdout).toBe(""); // Vitest never started
  });

  it("also refuses `npm test --no-docker`, where npm swallows the flag", () => {
    const { status, stderr } = run([], { npm_config_docker: "", CI: "1" });
    expect(status).toBe(1);
    expect(stderr).toContain("--no-docker is not allowed in CI/CD (detected CI=1)");
  });
});
