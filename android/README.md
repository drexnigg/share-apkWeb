# Share Booster — Android wrapper

A lightweight WebView wrapper around the Share Booster website. Built automatically by GitHub Actions on every push and published as a release asset (`share-booster.apk`) at the repo's "latest" release tag.

To target a different deployment URL, override the `WEB_URL` Gradle property:

```bash
./gradlew assembleRelease -PWEB_URL=https://your-domain.com
```

The default URL is configured in `app/build.gradle.kts`.
