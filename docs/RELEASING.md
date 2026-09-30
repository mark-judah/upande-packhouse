# Build & Release

The APK is built and released by GitHub Actions — no EAS build credits and no
manual APK step. The runner does what `eas build` would do, using `expo
prebuild` plus Gradle. (EAS is still configured in `eas.json` if you ever need
it; `appVersionSource` is `local` so both paths read the same version.)

## Signing (optional)

The pipeline works with no setup at all. Without signing secrets it builds and
publishes a **debug-signed** APK — perfectly installable by sideloading, which
is how this app is distributed. The release body and job summary both say so.

Its limits, which are the reason to set up a real key eventually:

- it cannot be published to Google Play;
- Android's debug key is public, so anyone can build an "upgrade" for your app;
- switching to a real key later means users must **uninstall before updating** —
  Android refuses to install over an APK signed with a different key.

That last point is the one that bites. If you expect to sign properly at all,
doing it before the app is on people's phones costs nothing; doing it afterwards
costs everyone a reinstall.

### Setting up an upload keystore

Android identifies an app by its signing key, so this is generated once and then
kept forever.

```bash
./scripts/setup-signing.sh
```

That generates `upande-packhouse-upload.keystore` (PKCS12 — Gradle's default store
type) and prints its password once. It uses `keytool` if a JDK is installed and
falls back to `openssl` otherwise, so it works without a JDK. If the GitHub CLI
is installed and authenticated it uploads the secrets directly; otherwise it
writes them to `SECRETS-TO-UPLOAD.txt` for pasting into
**Settings → Secrets and variables → Actions**.

| Secret | Contents |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (`upande-packhouse`) |
| `ANDROID_KEY_PASSWORD` | key password (same as the store password — PKCS12 does not meaningfully separate them) |
| `ANDROID_KEY_SHA256` | certificate fingerprint, so the build can prove it signed with the right key |

If a secret is already on the repo, `./scripts/upload-secrets.sh` pushes the
values from `SECRETS-TO-UPLOAD.txt` without regenerating the key.

Signing switches on only when **all four** of the first secrets are present —
a partial set is treated as unconfigured rather than half-signing. Put them in
**Repository secrets**, not Environment secrets: environment secrets are only
injected into jobs that declare `environment:`, and this job does not.

`ANDROID_KEY_SHA256` is optional but recommended: without it the build only
checks that it wasn't debug-signed, rather than that it was signed with *your*
key.

**Back up the keystore file and password in a password manager.** It is
gitignored and it cannot be regenerated. Losing it means every existing install
has to be uninstalled before it can be updated.

## Day-to-day flow

```
branch ──▶ PR to master ──▶ PR Checks ──▶ merge ──▶ Release ─┬─▶ 1.2.x: eas update --branch preview
                                                              └─▶ 1.x.0: signed APK on GitHub Release
```

### On a pull request — `.github/workflows/pr.yml`

Three jobs run against every PR targeting `master`:

- **Lint, typecheck, tests & dependency check** — `expo lint`, `tsc --noEmit`,
  `jest --ci`, plus `expo install --check` and `expo-doctor` (both advisory
  for now: a few packages trail the SDK 54 patch line — run
  `npx expo install --fix`, then drop `continue-on-error` in `pr.yml`).
- **Version preview** — posts the exact version and `versionCode` the merge will
  produce to the run summary.
- **Debug APK** — prebuilds and assembles a debug APK, uploaded as an artifact
  so a reviewer can install the PR on a device. This is what proves the native
  project still compiles before the merge lands.

### On merge to master — `.github/workflows/release.yml`

Every merge advances the version one odometer step (see [Versioning](#versioning)),
then ships it one of two ways depending on the **runtime** (`major.minor`):

| Release | Runtime | How it ships |
| --- | --- | --- |
| `1.2.x` patch | unchanged (`1.2`) | `eas update --branch preview --message "…" --platform android` — JS only, installed `1.2` APKs pick it up on next launch |
| `1.x.0` / `x.0.0` | new (`1.3`, `2.0`) | prebuild + `./gradlew assembleRelease`, signed, verified with `apksigner`, attached to the GitHub Release as `upande_packhouse_vx.y.z.apk` |

The update message is the workflow's `message` input when run by hand,
otherwise the PR title of the merge (or the commit subject for a direct push).

Both paths then commit `chore(release): x.y.z [skip ci]`, tag `vx.y.z`, and
publish a GitHub Release with generated notes. The OTA is published *before*
the tag, so a failed `eas update` leaves nothing tagged and the next run retries.

To cut a new APK, run the **Release** workflow from the Actions tab with
`minor` (→ `1.x.0`) or `major`. Do this whenever a change touches native code:
a new native package, a config plugin, permissions, or anything in `app.json`
that prebuild bakes in — an OTA cannot deliver those.

The very first release after this setup is always an APK: builds made before
it used the `appVersion` runtime policy, so no existing install can accept a
`major.minor` update until it has been replaced.

## Versioning

`app.json` → `expo.version` is the single source of truth; `package.json` is
kept in sync.

**Every merge to master advances the version by exactly one step.** The digits roll
over like an odometer:

- **patch (`z`)** counts `0`–`99`, then carries into the minor
- **minor (`y`)** counts `0`–`49`, then carries into the major
- **major (`x`)** is unbounded

```
1.0.0 → 1.0.1 → … → 1.0.99 → 1.1.0 → 1.1.1 → … → 1.49.99 → 2.0.0 → 2.0.1 → …
```

So one major version is 5,000 releases wide (50 minors × 100 patches).

Because the limits are fixed, the version *is* a counter in disguise, which is
exactly what Android's `versionCode` needs:

```
versionCode = (major * 50 + minor) * 100 + patch
```

`1.0.0` → `5000`, `1.0.99` → `5099`, `1.1.0` → `5100`, `2.0.0` → `10000`. It goes
up by exactly 1 per release, never collides, and needs no external counter. A
version outside the limits (`1.50.0`, `1.0.100`) makes the script fail loudly
rather than silently emit a lower code.

Commit style has no effect on the version. It is not enforced anywhere. If a
subject happens to start with a conventional-commit type — `feat:`, `fix:`,
`perf:`, `refactor:`, `docs:`, `build:`, `ci:`, `chore:` — the release notes
group it under that heading; anything else lands under **Other**. Either way the
commit shows up in the changelog.

Preview what a branch would release:

```bash
npm run version:next          # 1.0.0 -> 1.0.1 (patch, versionCode 5001, …)
npm run version:notes         # the changelog markdown
```

To skip ahead to a round number — say a release worth calling `1.1.0` rather
than `1.0.37` — run the **Release** workflow manually from the Actions tab and
pick `minor` or `major`. Those still respect the rollover: `--bump minor` on
`1.49.5` lands on `2.0.0`.

## Signing, and why there's a config plugin

`expo prebuild` regenerates `android/` from scratch on every run, and the stock
template signs release builds with a throwaway debug key. `plugins/withReleaseSigning.js`
re-applies a real `release` signing config on each prebuild, driven by Gradle
properties so no secret is ever written to a file in the repo. Without the
properties set it falls back to debug signing, so local release builds still
work.

## Building locally

```bash
npm ci
npm run build:apk    # prebuild + gradlew assembleRelease (debug-signed)
```

To sign locally with the real key:

```bash
npm run prebuild
cd android && ./gradlew assembleRelease \
  -PUPANDE_STORE_FILE="$PWD/../upande-packhouse-upload.keystore" \
  -PUPANDE_STORE_PASSWORD=... \
  -PUPANDE_KEY_ALIAS=upande-packhouse \
  -PUPANDE_KEY_PASSWORD=...
```

Requires JDK 17 and the Android SDK.

> `expo prebuild` rewrites the `android`/`ios` npm scripts to `expo run:*` once a
> native directory exists. If you prebuild locally, discard that change
> (`git checkout -- package.json`) and delete `android/` when you're done. CI
> does exactly this before committing.

## OTA updates (EAS Update)

`version.mjs --apply` writes `runtimeVersion` as `major.minor`, so every `1.2.x`
bundle is accepted by every `1.2.0`+ APK and rejected by a `1.1` or `1.3` one.

Setup, once:

- Add an **`EXPO_TOKEN`** repository secret (expo.dev → Account settings →
  Access tokens, for an account with access to `@markjk/upande-packhouse`).
  Without it a patch release fails at "Require an Expo token".
- The APK asks for channel **`preview`** (`updates.requestHeaders` in
  `app.json`). Make sure that channel points at the `preview` branch:
  `eas channel:view preview`, or `eas channel:create preview` if it does not
  exist yet.

Publishing by hand works the same way:

```bash
eas update --branch preview --message "Updated bucket requests shelf visibility" --platform android
```
