import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";
import QuickStart from "@site/docs/_partials/quick-start.mdx";
import styles from "./index.module.css";

interface Feature {
  readonly title: string;
  readonly description: ReactNode;
  readonly to: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: "A fluent, typed builder",
    description: "Stubs from recorded directories, files, npm packages or inline objects – validated as you register them, long before Docker starts.",
    to: "/docs/guides/registering-stubs",
  },
  {
    title: "Verify real HTTP",
    description: "Assert on what your code actually sent with countRequests() and findRequests() – WireMock's request matching, fully typed.",
    to: "/docs/guides/verifying-requests",
  },
  {
    title: "Fast isolation",
    description: "One container per suite; reset() restores stubs, scenarios and the journal between tests in milliseconds – no restarts.",
    to: "/docs/guides/test-isolation",
  },
  {
    title: "WireMock extensions",
    description: "Load compiled extension JARs and wrap them in TypeScript extensions with typed stub helpers – no JDK needed.",
    to: "/docs/extensions/java-extensions",
  },
  {
    title: "No Docker? Develop anyway",
    description: "For local development, serve every container from a local WireMock JVM – refused in CI/CD, so Docker stays the source of truth.",
    to: "/docs/guides/running-without-docker",
  },
  {
    title: "Examples that cannot drift",
    description: "Every snippet on this site is embedded from an examples project that is type-checked, linted and tested against WireMock.",
    to: "/docs/contributing/documentation",
  },
];

function Hero(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={`hero hero--primary ${styles.hero}`}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/quick-start">
            Get started
          </Link>
          <Link className="button button--outline button--secondary button--lg" to="/docs/api">
            API reference
          </Link>
        </div>
        <code className={styles.install}>npm install --save-dev @hellaweb3/wiremock-testcontainers-nodejs</code>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout description="WireMock in Testcontainers for Node.js: mock HTTP APIs in integration tests with a fluent, fully typed TypeScript API.">
      <Hero />
      <main className="container margin-vert--xl">
        <section className="row">
          {FEATURES.map(({ title, description, to }) => (
            <div key={title} className={`col col--4 ${styles.feature}`}>
              <Heading as="h3">
                <Link to={to}>{title}</Link>
              </Heading>
              <p>{description}</p>
            </div>
          ))}
        </section>
        <section className={styles.example}>
          <Heading as="h2">A complete test suite</Heading>
          <QuickStart />
        </section>
      </main>
    </Layout>
  );
}
