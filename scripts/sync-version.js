import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tauriConfigPath = path.resolve(__dirname, '../src-tauri/tauri.conf.json');
const cargoTomlPath = path.resolve(__dirname, '../src-tauri/Cargo.toml');
const cargoLockPath = path.resolve(__dirname, '../src-tauri/Cargo.lock');

try {
  const newVersion = process.env.npm_package_version;
  if (!newVersion) {
    console.error('Error: npm_package_version not found.');
    process.exit(1);
  }

  // 1. Update tauri.conf.json
  const config = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
  config.version = newVersion;
  fs.writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2) + '\n');

  // 2. Update Cargo.toml version string
  let cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
  cargoContent = cargoContent.replace(
    /(\[package\][\s\S]*?version\s*=\s*")(.+?)(")/,
    `$1${newVersion}$3`
  );
  fs.writeFileSync(cargoTomlPath, cargoContent);

  // 3. Trigger Cargo.lock update via metadata
  console.log(`Syncing Cargo.lock to v${newVersion}...`);
  execSync('cargo metadata --format-version 1 --no-deps --manifest-path src-tauri/Cargo.toml', { stdio: 'ignore' });

  // 4. Polling: Wait until Cargo.lock physically reflects the new version
  let synced = false;
  for (let i = 0; i < 5; i++) {
    const lockContent = fs.readFileSync(cargoLockPath, 'utf8');
    if (lockContent.includes(`name = "aivys"\nversion = "${newVersion}"`)) {
      synced = true;
      break;
    }
    console.log(`Waiting for file system sync (attempt ${i + 1}/5)...`);

    // Synchronous sleep without external 'timeout' command
    const waitTill = new Date(new Date().getTime() + 1000);
    while (waitTill > new Date()) { /* wait */ }
  }

  if (synced) {
    console.log(`Successfully synced all configs to v${newVersion}`);
  } else {
    console.warn('Warning: Cargo.lock sync timed out. Manual check recommended.');
  }
} catch (err) {
  console.error('Sync failed:', err.message);
  process.exit(1);
}