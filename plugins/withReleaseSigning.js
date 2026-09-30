/**
 * Expo config plugin: teach the generated Android project about a real release
 * keystore.
 *
 * `expo prebuild` regenerates android/ from scratch on every CI run, and the
 * stock template signs release builds with the throwaway debug key. This plugin
 * re-applies a `release` signing config each time prebuild runs, driven entirely
 * by Gradle properties so no secret ever lands in the repo:
 *
 *   ./gradlew assembleRelease \
 *     -PUPANDE_STORE_FILE=/abs/path/release.keystore \
 *     -PUPANDE_STORE_PASSWORD=... \
 *     -PUPANDE_KEY_ALIAS=... \
 *     -PUPANDE_KEY_PASSWORD=...
 *
 * When those properties are absent (a local `npx expo run:android --variant
 * release`, say) the build falls back to debug signing instead of failing.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'UPANDE_STORE_FILE';

const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('${MARKER}')) {
                storeFile file(project.property('${MARKER}'))
                storePassword project.property('UPANDE_STORE_PASSWORD')
                keyAlias project.property('UPANDE_KEY_ALIAS')
                keyPassword project.property('UPANDE_KEY_PASSWORD')
            }
        }`;

const RELEASE_SIGNING_REFERENCE =
  `signingConfig project.hasProperty('${MARKER}') ? signingConfigs.release : signingConfigs.debug`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        'withReleaseSigning only supports Groovy build.gradle files, got ' +
          cfg.modResults.language,
      );
    }

    let gradle = cfg.modResults.contents;

    // Idempotent: prebuild --clean starts from the template, but a warm
    // android/ directory would otherwise accumulate duplicate blocks.
    if (gradle.includes(MARKER)) return cfg;

    const signingConfigs = gradle.indexOf('signingConfigs {');
    if (signingConfigs === -1) {
      throw new Error('Could not find a signingConfigs block in app/build.gradle.');
    }
    const insertAt = signingConfigs + 'signingConfigs {'.length;
    gradle = gradle.slice(0, insertAt) + RELEASE_SIGNING_CONFIG + gradle.slice(insertAt);

    // The template references signingConfigs.debug twice: once in the debug
    // build type, once in release. Only the last one — release — is ours.
    const target = 'signingConfig signingConfigs.debug';
    const releaseRef = gradle.lastIndexOf(target);
    if (releaseRef === -1 || releaseRef <= insertAt) {
      throw new Error('Could not find the release build type signing config in app/build.gradle.');
    }
    gradle =
      gradle.slice(0, releaseRef) +
      RELEASE_SIGNING_REFERENCE +
      gradle.slice(releaseRef + target.length);

    cfg.modResults.contents = gradle;
    return cfg;
  });
}

module.exports = withReleaseSigning;
