/** `npm test --no-docker`: serve every WiremockContainer from a local WireMock JVM. Throws in CI/CD. */
import { installNoDockerRuntime } from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";

installNoDockerRuntime();
