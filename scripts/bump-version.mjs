#!/usr/bin/env node
/**
 * Bump version across manifest.json + versions.json + package.json.
 * Usage: node scripts/bump-version.mjs <new-version> [<min-obsidian-version>]
 *
 * - <new-version> uses pure semver, e.g. "0.2.0" (NO `v` prefix; Obsidian rejects v-prefixed tags).
 * - <min-obsidian-version> defaults to the current minAppVersion in manifest.json.
 *
 * After running, commit the changes and tag with `./tag.ps1 -Tag <new-version>`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , newVersion, minAppVersionArg] = process.argv;

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("Usage: node scripts/bump-version.mjs <semver> [<min-obsidian-version>]");
  console.error('Example: node scripts/bump-version.mjs 0.2.0');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const minApp = minAppVersionArg ?? manifest.minAppVersion;

manifest.version = newVersion;
manifest.minAppVersion = minApp;
versions[newVersion] = minApp;
pkg.version = newVersion;

writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

console.log(`Bumped to ${newVersion} (minAppVersion=${minApp}).`);
console.log(`Next:`);
console.log(`  git add -A && git commit -m "release: ${newVersion}" && git push`);
console.log(`  ./tag.ps1 -Tag ${newVersion}`);
