/** `pnpm test:e2e --no-docker`: serve every WiremockContainer from a local WireMock JVM. Throws in CI/CD. */
import { installNoDockerRuntime } from "../../src/no-docker";

installNoDockerRuntime();
