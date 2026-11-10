## Publishing

```bash
# Build the package
pnpm run build

# Publish to npm
np --no-publish

# Trigger GitHub release workflow
git push origin --tags
```

This will trigger the release.yml and publish.yml workflows.
