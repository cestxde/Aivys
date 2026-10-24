// Runs from `npm version` (the "version" script), after npm has written the
// new version to package.json and before it commits: copies the version to
// the Tauri config, Cargo.toml and Cargo.lock.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriConfigPath = path.join(root, 'src-tauri/tauri.conf.json');
const cargoTomlPath = path.join(root, 'src-tauri/Cargo.toml');
const cargoLockPath = path.join(root, 'src-tauri/Cargo.lock');
const manifest = '--manifest-path src-tauri/Cargo.toml';

const fail = (message) => {
  console.error(`sync-version: ${message}`);
  process.exit(1);
};

const version = process.env.npm_package_version;
if (!version) fail('npm_package_version is not set; run this through `npm version`.');

// 1. tauri.conf.json
const config = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
config.version = version;
fs.writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2) + '\n');

// 2. Cargo.toml: the first `version` of the [package] table.
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const updatedToml = cargoToml.replace(/(\[package\][\s\S]*?\nversion\s*=\s*")[^"]*(")/, `$1${version}$2`);
if (updatedToml === cargoToml && !cargoToml.includes(`version = "${version}"`)) {
  fail('no [package] version found in Cargo.toml.');
}
fs.writeFileSync(cargoTomlPath, updatedToml);

// 3. Cargo.lock: `cargo update --workspace` rewrites only this package's entry
// (dependencies are left as they are). `cargo metadata --no-deps` would not
// touch the lock at all. Offline first: no network needed once dependencies
// are cached.
const run = (command) => execSync(command, { cwd: root, stdio: 'pipe' });
try {
  run(`cargo update --workspace --offline ${manifest}`);
} catch {
  try {
    run(`cargo update --workspace ${manifest}`);
  } catch (err) {
    fail(`cargo update failed: ${err.stderr?.toString().trim() || err.message}`);
  }
}

// cargo has finished writing when it exits; check the result anyway.
const lock = fs.readFileSync(cargoLockPath, 'utf8');
if (!new RegExp(`name = "aivys"\\r?\\nversion = "${version.replace(/\./g, '\\.')}"`).test(lock)) {
  fail(`Cargo.lock does not list aivys ${version}.`);
}

console.log(`sync-version: tauri.conf.json, Cargo.toml and Cargo.lock are at ${version}`);
