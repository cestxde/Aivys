# Releasing Aivys

Installed copies update themselves from the GitHub releases of this
repository: on startup (unless turned off in Settings → Version and updates)
the app reads `latest.json` of the latest published release, and offers the
new version with its release notes.

## One-time setup

1. **Updater key.** Every update is signed; the app installs only updates
   signed with this key. Generate it once:

   ```powershell
   npx tauri signer generate -w "$env:USERPROFILE\.tauri\aivys.key"
   ```

   It asks for a password. The public key (also in `aivys.key.pub`) goes into
   `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

   **Back up `aivys.key` and its password.** Losing them means installed
   copies can never update again (they would need a manual reinstall).

2. **GitHub secrets** (repository → Settings → Secrets and variables →
   Actions):
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of `aivys.key`;
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password.

## A release

1. `npm version minor` (or `patch` / `major`): bumps the version in
   `package.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`, commits
   and tags `vX.Y.Z`.
2. `git push --follow-tags`.
3. The `Release` workflow (`.github/workflows/release.yml`) builds the Windows
   installer on GitHub, signs the update and creates a **draft** release with
   the installer, its signature and `latest.json`. The notes are made from the
   commits since the previous tag (`scripts/release-notes.js`): `feat:` under
   "New", `fix:` under "Fixed"; other commits are left out.
4. Check the draft (edit the notes if needed) and **publish** it. Only then do
   installed apps see the new version.

Update files are built only in the workflow
(`src-tauri/tauri.release.conf.json`), so a local `npx tauri build` works
without the key.

## Versions

Semantic versioning, with the shared `.aivys/` folder in mind (several devices,
possibly on different versions, read and write the same library):

- **Major** (`2.0.0`): a change to the `.aivys/` format that older versions
  cannot read or would damage. Rare, and announced in the notes.
- **Minor** (`1.1.0`): new features; the format stays compatible.
- **Patch** (`1.0.1`): fixes only.

The format has its own `schemaVersion` per file (`docs/aivys-format.md`),
independent of the app version.

Before 1.0 a minor bump may still change things freely. A fault in the update
mechanism itself is hard to fix later (a broken version may be unable to
update), so it is worth a couple of real updates before calling a version 1.0.

## Windows SmartScreen

The installer is not code-signed, so on the first install Windows shows
"Windows protected your PC" → "More info" → "Run anyway". Updates are not
affected. A code-signing certificate (e.g. Azure Trusted Signing) removes the
warning; it is not set up.
