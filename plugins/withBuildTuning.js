/**
 * Expo config plugin: give the Gradle build enough memory to finish.
 *
 * `expo prebuild` regenerates android/ from scratch on every CI run, so
 * gradle.properties cannot simply be edited and committed — it has to be
 * re-applied, which is what this does.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * Adding `expo-updates` brought six more native modules with it (expo-eas-client,
 * expo-json-utils, expo-manifests, expo-structured-headers,
 * expo-updates-interface and expo-updates itself). Each is another Kotlin
 * compilation and another set of classes to dex, and the build tipped past the
 * default heap:
 *
 *     The Daemon will expire after the build after running out of JVM Metaspace.
 *     > Task :app:packageRelease FAILED
 *
 * Metaspace is the specific one that ran out — it holds class metadata, and this
 * build now loads a great many classes — so both it and the heap are raised
 * here. The defaults Gradle picks are sized for a small project, and this is no
 * longer one.
 *
 * `HeapDumpOnOutOfMemoryError` is set so that if it happens again the failure
 * arrives with evidence rather than as a task that simply stopped.
 */

const { withGradleProperties } = require('expo/config-plugins');

/**
 * Sized for a GitHub-hosted runner (4 cores, 16GB) with room to spare. Raising
 * these costs nothing on a machine that has the memory, and the build cannot
 * finish on one that does not.
 */
const PROPERTIES = {
  'org.gradle.jvmargs':
    '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',

  /**
   * Real Android devices only.
   *
   * The template builds four architectures, and each one carries its own copy of
   * every native library — Hermes, the React Native runtime, expo-modules-core,
   * screens, svg. That is what made the release APK 74MB, and a 74MB download to
   * a phone on mobile data is the thing that has actually been failing.
   *
   * `x86` and `x86_64` exist for emulators. No device in the field runs either,
   * so they were paying for themselves twice: once in the download and once in
   * the build's memory and wall-clock.
   *
   * `armeabi-v7a` stays alongside `arm64-v8a`. It is 32-bit ARM, which is what
   * older and cheaper handsets run, and this app is deployed to farms rather
   * than to a fleet of recent phones — dropping it would halve the APK again at
   * the cost of silently excluding those devices.
   *
   * The trade: this APK will not install on an Android emulator. A local
   * `npx expo run:android` on an emulator needs the filter lifted for that run:
   *
   *     ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
   */
  reactNativeArchitectures: 'armeabi-v7a,arm64-v8a',
};

function withBuildTuning(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find(
        (item) => item.type === 'property' && item.key === key,
      );
      // Set, not appended: the template ships its own `org.gradle.jvmargs`, and
      // a duplicate key would leave which one wins up to file order.
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

module.exports = withBuildTuning;
