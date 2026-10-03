#!/usr/bin/env node
/**
 * Odometer versioning for the Expo app.
 *
 * Every merge to the release branch advances the version by exactly one step.
 * The digits roll over like an odometer with fixed limits:
 *
 *   patch (z) counts 0..99  — 1.0.99 + 1 -> 1.1.0
 *   minor (y) counts 0..49  — 1.49.99 + 1 -> 2.0.0
 *   major (x) is unbounded
 *
 * Because the limits are fixed, a version maps one-to-one onto a plain counter,
 * which is exactly what Android's versionCode wants:
 *
 *   versionCode = (major * 50 + minor) * 100 + patch
 *
 * So versionCode is dense, strictly increasing, and needs no external state.
 *
 * Single source of truth for the version is app.json -> expo.version.
 * package.json is kept in sync so `npm version`-style tooling stays honest.
 *
 * Usage:
 *   node scripts/version.mjs                 # print the next version (dry run)
 *   node scripts/version.mjs --json          # machine-readable, for CI outputs
 *   node scripts/version.mjs --apply         # write app.json + package.json
 *   node scripts/version.mjs --bump minor    # skip ahead to the next minor/major
 *   node scripts/version.mjs --notes         # print the release notes markdown
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = resolve(ROOT, 'app.json');
const PKG_JSON = resolve(ROOT, 'package.json');

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const flagValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

function git(...args) {
  try {
    // stderr is swallowed: `git describe` on a repo with no tags is an expected
    // state (the first release), not something worth printing.
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Most recent v* tag, or null on a repo that has never been released. */
function lastTag() {
  return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') || null;
}

/**
 * Commits since the last tag. Records are NUL-separated so multi-line bodies
 * (where BREAKING CHANGE: footers live) survive parsing intact.
 */
function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git('log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e');
  if (!raw) return [];
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split('\x1f');
      return { hash, subject: subject ?? '', body: body ?? '' };
    });
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/i;

function parse(commit) {
  const match = HEADER.exec(commit.subject);
  const breaking =
    Boolean(match?.groups?.breaking) || /^BREAKING[ -]CHANGE:/m.test(commit.body);
  return {
    ...commit,
    type: match?.groups?.type?.toLowerCase() ?? null,
    scope: match?.groups?.scope ?? null,
    description: match?.groups?.description ?? commit.subject,
    breaking,
  };
}

/** Odometer limits: patch wraps at 100, minor wraps at 50. */
const PATCH_LIMIT = 100;
const MINOR_LIMIT = 50;

/**
 * Release line 2: numbering restarted at 1.0.0 (the old line's releases are
 * the `legacy-v*` tags, kept as pre-releases). Its build numbers and runtimes
 * sit apart from line 1's, which reused the same x.y.z:
 *
 * - versionCode + 100000, so a line-2 APK installs OVER any line-1 build and
 *   keeps the phone's data -- Android refuses a lower versionCode.
 * - runtime major + 100 ("101.0" for 1.0.x), so a line-2 JS update is never
 *   handed to a phone still running a line-1 APK of the same x.y, whose native
 *   code is different.
 */
const VERSION_CODE_BASE = 100000;
const RUNTIME_MAJOR_BASE = 100;

function parseVersion(version) {
  const parts = version.split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Not a valid x.y.z version: ${version}`);
  }
  const [major, minor, patch] = parts;
  if (minor >= MINOR_LIMIT) {
    throw new Error(`Minor ${minor} in ${version} is out of range (max ${MINOR_LIMIT - 1}).`);
  }
  if (patch >= PATCH_LIMIT) {
    throw new Error(`Patch ${patch} in ${version} is out of range (max ${PATCH_LIMIT - 1}).`);
  }
  return { major, minor, patch };
}

/**
 * One odometer step. `bump` normally stays 'patch' — one merge, one click. The
 * 'minor'/'major' overrides skip the remaining digits, for when a release is
 * significant enough to deserve a round number.
 */
function nextVersion(current, bump = 'patch') {
  let { major, minor, patch } = parseVersion(current);

  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }
  if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  if (patch >= PATCH_LIMIT) {
    patch = 0;
    minor += 1;
  }
  if (minor >= MINOR_LIMIT) {
    minor = 0;
    major += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * Play Store requires a monotonically increasing integer. Since the odometer
 * limits are fixed, the version *is* a counter in disguise — just read it back
 * out. No external state, and it never collides or goes backwards.
 */
/**
 * The runtime a version belongs to: everything sharing `major.minor` runs the
 * same native build, so it can accept the same EAS Update bundle. A patch
 * release keeps the runtime and ships over the air; a new minor or major moves
 * it and needs a fresh APK.
 */
function runtimeVersionFor(version) {
  const { major, minor } = parseVersion(version);
  return `${RUNTIME_MAJOR_BASE + major}.${minor}`;
}

function versionCodeFor(version) {
  const { major, minor, patch } = parseVersion(version);
  return VERSION_CODE_BASE + (major * MINOR_LIMIT + minor) * PATCH_LIMIT + patch;
}

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Bug Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['build', 'Build System'],
  ['ci', 'CI'],
  ['chore', 'Chores'],
];

function releaseNotes(version, commits, tag) {
  const line = (c) =>
    `- ${c.scope ? `**${c.scope}:** ` : ''}${c.description} (${c.hash.slice(0, 7)})`;

  const out = [`## v${version}`, ''];

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    out.push('### ⚠ BREAKING CHANGES', '', ...breaking.map(line), '');
  }

  for (const [type, heading] of SECTIONS) {
    const matching = commits.filter((c) => c.type === type && !c.breaking);
    if (matching.length) out.push(`### ${heading}`, '', ...matching.map(line), '');
  }

  const other = commits.filter(
    (c) => !c.breaking && !SECTIONS.some(([type]) => type === c.type),
  );
  if (other.length) out.push('### Other', '', ...other.map(line), '');

  if (commits.length === 0) out.push('_No commits since the previous release._', '');

  const repo = process.env.GITHUB_REPOSITORY;
  if (repo && tag) {
    out.push(
      `**Full changelog:** https://github.com/${repo}/compare/${tag}...v${version}`,
      '',
    );
  }

  return out.join('\n');
}

// --- main -------------------------------------------------------------------

const appConfig = JSON.parse(readFileSync(APP_JSON, 'utf8'));
const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));

const currentVersion = appConfig.expo.version;
const tag = lastTag();
const commits = commitsSince(tag).map(parse);
// Always one step per merge; --bump only exists to skip to a round number.
const bump = flagValue('bump') ?? 'patch';
// --set X.Y.Z puts the version somewhere specific, e.g. 1.0.0 to start a new
// release line; otherwise one odometer step.
const setTo = flagValue('set');
if (setTo) parseVersion(setTo);
const version = hasFlag('keep-version')
  ? currentVersion
  : setTo || nextVersion(currentVersion, bump);
const versionCode = versionCodeFor(version);

if (hasFlag('apply')) {
  appConfig.expo.version = version;
  appConfig.expo.android = { ...appConfig.expo.android, versionCode };
  // expo-updates refuses a bundle whose runtime does not match the installed
  // build, so this is what keeps a 1.1.x update off a 1.0.x APK.
  appConfig.expo.runtimeVersion = runtimeVersionFor(version);
  writeFileSync(APP_JSON, `${JSON.stringify(appConfig, null, 2)}\n`);

  pkg.version = version;
  writeFileSync(PKG_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
}

if (hasFlag('notes')) {
  process.stdout.write(releaseNotes(version, commits, tag));
} else if (hasFlag('json')) {
  process.stdout.write(
    `${JSON.stringify(
      {
        current: currentVersion,
        version,
        versionCode,
        runtimeVersion: runtimeVersionFor(version),
        currentRuntimeVersion: appConfig.expo.runtimeVersion,
        // `ota` when the new version stays on the runtime the installed APKs
        // already have; anything else — a new minor/major, or a runtime still
        // on the old `appVersion` policy object — needs an APK.
        release:
          appConfig.expo.runtimeVersion === runtimeVersionFor(version) ? 'ota' : 'apk',
        bump,
        tag: `v${version}`,
        previousTag: tag,
        commitCount: commits.length,
        breaking: commits.filter((c) => c.breaking).length,
      },
      null,
      2,
    )}\n`,
  );
} else {
  process.stdout.write(
    `${currentVersion} -> ${version} (${bump}, versionCode ${versionCode}, ` +
      `${commits.length} commit${commits.length === 1 ? '' : 's'} since ${tag ?? 'the beginning'})\n`,
  );
}
