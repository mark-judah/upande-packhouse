#!/usr/bin/env node
/**
 * Build a JavaScript-only update and lay it out as static files.
 *
 * A patch release (1.0.5 -> 1.0.6) cannot contain native changes, so it does not
 * need a 74MB APK — it needs the JS bundle and its assets, which is about a
 * megabyte. This produces the tree GitHub Pages then serves:
 *
 *   ota/android/<runtime>/manifest.json                    the Expo Updates manifest
 *   ota/android/<runtime>/_expo/static/js/android/*.hbc    the Hermes bundle
 *   ota/android/<runtime>/assets/...                       fonts, images
 *
 * ── Who serves what ──────────────────────────────────────────────────────────
 *
 * GitHub Pages hosts the bundle and the assets ONLY. The manifest.json written
 * here is not what the device fetches directly: `expo-updates` refuses a
 * manifest response without an `expo-protocol-version` header ("Legacy
 * manifests are no longer supported", `UpdateFactory.kt`), and a static host
 * cannot set one. So `updates.url` points at the Frappe site
 * (`upande_sensors.api.ota.manifest`), which reads the `expo-runtime-version`
 * and `expo-platform` headers the client already sends, fetches
 * `<otaBaseUrl>/<platform>/<runtime>/manifest.json` from Pages, and returns it
 * with the header added. Asset downloads need no special headers, so they go to
 * Pages directly — which is why every URL in the manifest is absolute and built
 * from `extra.otaBaseUrl` rather than from `updates.url`.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 *
 * No code signing. `expo-updates` supports signed manifests, and a static host
 * can serve a signature just as well as a manifest — but the key has to be
 * generated and stored as a secret first, so it is a deliberate follow-up rather
 * than something to half-do here. Until then the trust boundary is HTTPS and
 * write access to the Pages branch.
 *
 * Usage:
 *   node scripts/publish-ota.mjs              # build into ./ota
 *   node scripts/publish-ota.mjs --out dist   # somewhere else
 */

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = join(ROOT, 'app.json');

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const OUT = resolve(ROOT, outFlag === -1 ? 'ota' : args[outFlag + 1] || 'ota');

const appConfig = JSON.parse(readFileSync(APP_JSON, 'utf8'));
const { version, runtimeVersion } = appConfig.expo;
if (!runtimeVersion) {
  console.error('app.json has no expo.runtimeVersion — run `node scripts/version.mjs --apply` first.');
  process.exit(2);
}

const EXPORT_DIR = join(ROOT, '.ota-export');
rmSync(EXPORT_DIR, { recursive: true, force: true });

console.log(`Exporting ${version} (runtime ${runtimeVersion})…`);
execFileSync(
  'npx',
  ['expo', 'export', '--platform', 'android', '--output-dir', EXPORT_DIR],
  { cwd: ROOT, stdio: 'inherit' },
);

/** Every file under `dir`, as paths relative to it. */
function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full)];
  });
}

/**
 * The hash the client verifies, in the encoding the protocol wants: base64url
 * of the raw SHA-256, with the padding stripped. Hex would be silently rejected.
 */
function hashOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('base64url');
}

const metadata = JSON.parse(readFileSync(join(EXPORT_DIR, 'metadata.json'), 'utf8'));
const android = metadata.fileMetadata?.android;
if (!android) {
  console.error('The export produced no android metadata — nothing to publish.');
  process.exit(1);
}

const runtimeDir = join(OUT, 'android', runtimeVersion);
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

// Copy exactly what the manifest will reference, at the paths the export gave
// them. The bundle's location comes from metadata.json rather than a fixed
// directory name: `expo export` writes the Hermes bytecode under
// `_expo/static/js/<platform>/<hash>.hbc`, not the `bundles/` of older SDKs, and
// a copy loop over a guessed directory silently produced a manifest pointing at
// a file that was never published.
mkdirSync(dirname(join(runtimeDir, android.bundle)), { recursive: true });
cpSync(join(EXPORT_DIR, android.bundle), join(runtimeDir, android.bundle));
const assetsFrom = join(EXPORT_DIR, 'assets');
if (existsSync(assetsFrom)) cpSync(assetsFrom, join(runtimeDir, 'assets'), { recursive: true });

// Where Pages will serve this runtime's files from. Not derived from
// `updates.url`: that now points at the Frappe proxy, which is not where the
// bundle lives.
const otaBase = String(appConfig.expo.extra?.otaBaseUrl || '').replace(/\/+$/, '');
if (!otaBase) {
  console.error('app.json has no expo.extra.otaBaseUrl — nothing to build absolute asset URLs from.');
  process.exit(2);
}
const base = `${otaBase}/android/${runtimeVersion}`;

const assetEntry = (relPath, key) => ({
  hash: hashOf(join(runtimeDir, relPath)),
  key,
  contentType: relPath.endsWith('.js') ? 'application/javascript' : 'application/octet-stream',
  fileExtension: `.${relPath.split('.').pop()}`,
  url: `${base}/${relPath.split(/[\\/]/).join('/')}`,
});

const manifest = {
  // A new id per publish: this is the identity the client compares against what
  // it is already running, so reusing one would make an update invisible.
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  runtimeVersion,
  launchAsset: {
    ...assetEntry(android.bundle, 'bundle'),
    contentType: 'application/javascript',
  },
  assets: (android.assets || []).map((asset) => {
    const relPath = join('assets', asset.path.replace(/^assets[\\/]/, ''));
    const onDisk = existsSync(join(runtimeDir, relPath)) ? relPath : asset.path;
    return { ...assetEntry(onDisk, asset.path), fileExtension: `.${asset.ext}` };
  }),
  metadata: {},
  extra: {
    // Carried so the app can show which release a bundle came from; the protocol
    // itself only cares about `id` and `runtimeVersion`.
    appVersion: version,
    publishedAt: new Date().toISOString(),
  },
};

writeFileSync(join(runtimeDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(EXPORT_DIR, { recursive: true, force: true });

const bytes = walk(runtimeDir).reduce((sum, f) => sum + statSync(join(runtimeDir, f)).size, 0);
console.log(
  `\nWrote ${relative(ROOT, runtimeDir)}\n` +
    `  version ${version}, runtime ${runtimeVersion}, id ${manifest.id}\n` +
    `  ${manifest.assets.length + 1} files, ${(bytes / 1048576).toFixed(1)} MB\n` +
    `  Pages serves ${base}/manifest.json\n` +
    `  devices fetch it through ${appConfig.expo.updates?.url || '(updates.url unset)'}`,
);
