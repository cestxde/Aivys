<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo-white-en.svg">
    <img alt="Aivys Player" src="src/assets/logo-black-en.svg" width="350">
  </picture>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.ru.md">Русский</a>
</p>

**Aivys** is a cross-platform offline music player built with **Rust** and **Tauri 2**. It stays independent of cloud services and focuses on a fast local library: scanning, playback, tags, playlists, and statistics — with library data kept next to your music in a portable `.aivys/` folder.

## Library data & sync-friendly format

Aivys does **not** ship its own sync network. Instead, user data (play counts, listening time, favorites, tags, playlists, …) lives in **`.aivys/`** beside the music files, in a layout meant to be copied by tools you already use — [Syncthing](https://syncthing.net/), a shared folder, NAS, and so on.

The format is **file-first** and documented in [`docs/aivys-format.md`](docs/aivys-format.md): per-device append-only event journals, per-entity playlist/tag files, and built-in handling of **Syncthing conflict copies** so concurrent use across devices does not silently corrupt the library. SQLite on each device is a rebuildable **index/cache**, not the source of truth.

## Tech stack

* **Backend:** [Rust](https://www.rust-lang.org/) — file scanning, metadata, and the `.aivys/` store.
* **Frontend:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/).
* **Shell:** [Vite](https://vitejs.dev/) & [Tauri 2](https://v2.tauri.app/).
* **Index:** [SQLite](https://www.sqlite.org/) — local search and derived state from the journals.

## Platform support

| Platform | Status | Notes |
| :--- | :--- | :--- |
| **Android** | In development | Tested on Samsung A55 |
| **Windows** | In development | Windows 11 |
| **Linux / macOS** | Planned | — |

## Project status

Aivys is **experimental**. Current focus:

- Solid offline library UX on desktop and Android.
- A durable, sync-friendly on-disk format for multi-device libraries.
- Performance of large folder scans (especially on Android).

## Development setup

### Prerequisites

* **Rust:** [rustup](https://rustup.rs/) (stable).
* **Node.js:** v18 or newer.
* **Android Studio** (for Android builds):
    * SDK Platform API 34 or 35.
    * SDK Build-Tools, NDK (side by side), and CMake.
* **Environment:**
    * `ANDROID_HOME` → Android SDK.
    * `NDK_HOME` → NDK version (e.g. `...\ndk\26.x.x`).

### Initial setup

```powershell
git clone https://github.com/cestxde/Aivys.git
cd Aivys

npm install

# Android project files (once after cloning, if you build for Android)
npm run tauri android init
```

### Running

**Windows**

```powershell
npm run tauri dev
```

**Android** — device on USB with debugging enabled:

```powershell
npm run tauri android dev
```

> If you have several network adapters (VPN, Radmin, VM bridges), give the primary Wi‑Fi/Ethernet the highest priority (lowest metric) so the Android dev connection reaches the machine.

Release process: [`docs/releasing.md`](docs/releasing.md).

## License & trademark

Licensed under the **MIT License** — see [LICENSE](LICENSE).

The "Aivys Player" name, logos, and related graphics are subject to [BRANDING.md](BRANDING.md).
