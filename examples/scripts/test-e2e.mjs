#!/usr/bin/env node
/**
 * `npm test [--no-docker] [vitest options…]` – the end-user E2E flow, in Docker by default.
 *
 * `--no-docker` serves every WiremockContainer from a local WireMock JVM (needs Java 11+ and the
 * `wiremock` dev dependency): opt-in per run, announced with a banner, refused in CI/CD. npm
 * swallows the flag in `npm test --no-docker` and sets `npm_config_docker=""`; both forms work.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
// The CI/CD detection the harness itself enforces.
import { detectCI, NO_DOCKER_ENV } from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";

const FLAG = "--no-docker";
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

function main() {
  const args = process.argv.slice(2);
  const noDocker = args.includes(FLAG) || ["", "false"].includes(process.env.npm_config_docker);
  const env = { ...process.env };
  delete env[NO_DOCKER_ENV]; // the flag is the only switch – never inherited from the shell

  if (noDocker) {
    const ci = detectCI(process.env);
    if (ci) {
      console.error(paint("1;31", `✖ ${FLAG} is not allowed in CI/CD (detected ${ci}=${process.env[ci]}). Run the E2E suite with Docker.`));
      process.exitCode = 1;
      return;
    }
    console.warn(paint("1;33", BANNER));
    env[NO_DOCKER_ENV] = "1";
  }

  const vitest = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");
  const vitestArgs = args.filter((arg) => arg !== FLAG && arg !== "--");
  spawn(process.execPath, [vitest, "run", ...vitestArgs], { stdio: "inherit", env }).on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

main();
