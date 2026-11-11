#!/usr/bin/env node
/**
 * `pnpm test:e2e [--no-docker] [vitest options…]` – the E2E suite, in Docker by default.
 *
 * `--no-docker` serves every WiremockContainer from a local WireMock JVM (`src/no-docker.ts`):
 * opt-in per run, announced with a banner, refused in CI/CD. npm swallows the flag in
 * `npm run test:e2e --no-docker` and sets `npm_config_docker=""` instead; both forms work.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const FLAG = "--no-docker";
const ENV = "WIREMOCK_NO_DOCKER";
/** The harness's `CI_VARIABLES` – a unit test keeps both lists equal. */
const CI_VARIABLES = ["CI", "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "BUILDKITE", "JENKINS_URL", "TF_BUILD", "TEAMCITY_VERSION", "BITBUCKET_BUILD_NUMBER", "CODEBUILD_BUILD_ID"];
const BANNER = `
⚠  WIREMOCK --no-docker MODE – NOT FOR CI/CD

   E2E tests will NOT start Docker containers. Every WiremockContainer is served by a
   local WireMock standalone JVM process instead (Java 11+ and the \`wiremock\` npm
   package or WIREMOCK_JAR required). Mappings, files and CLI flags are applied as
   usual; container-only features (exec, networks, copying after start) throw.

   Results can differ from the Docker image. Use for local development only and run
   the suite with Docker before merging.
`;

const paint = (code, text) => (process.stderr.isTTY && !process.env.NO_COLOR ? `\u001B[${code}m${text}\u001B[0m` : text);
const detectCI = (env) =>
  CI_VARIABLES.find((name) => !["", "false", "0", undefined].includes(env[name]?.trim().toLowerCase()));

function main() {
  const args = process.argv.slice(2);
  const noDocker = args.includes(FLAG) || ["", "false"].includes(process.env.npm_config_docker);
  const env = { ...process.env };
  delete env[ENV]; // the flag is the only switch – never inherited from the shell

  if (noDocker) {
    const ci = detectCI(process.env);
    if (ci) {
      console.error(paint("1;31", `✖ ${FLAG} is not allowed in CI/CD (detected ${ci}=${process.env[ci]}). Run the E2E suite with Docker.`));
      process.exitCode = 1;
      return;
    }
    console.warn(paint("1;33", BANNER));
    env[ENV] = "1";
  }

  // vitest's CLI via this Node binary: no reliance on node_modules/.bin being on the PATH.
  const vitest = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");
  // `pnpm test:e2e -- --no-docker` forwards the `--`; vitest must see neither it nor the flag.
  const vitestArgs = args.filter((arg) => arg !== FLAG && arg !== "--");
  spawn(process.execPath, [vitest, "run", "test/index.test.ts", ...vitestArgs], { stdio: "inherit", env }).on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

main();
