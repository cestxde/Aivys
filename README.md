<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo-white-en.png">
    <img alt="Aivys Player" src="src/assets/logo-black-en.png" width="350">
  </picture>
</p>

**Aivys** is a cross-platform offline music player built with **Rust** and **Tauri 2.0**. The project focuses on complete independence from cloud services, providing a high-performance environment for managing local music libraries with a focus on data integrity.

## 📡 Core Concept
Unlike traditional streaming services or simple players, **Aivys** aims to implement a seamless **local synchronization engine**. It allows users to keep their music tracks and playlists in sync across Android and Desktop devices within a local network, ensuring that your library remains consistent without relying on external servers.

## 🛠 Tech Stack
* **Backend:** [Rust](https://www.rust-lang.org/) — ensures memory safety and high performance for file processing.
* **Frontend:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — a modern, responsive UI.
* **Build Tool:** [Vite](https://vitejs.dev/) & [Tauri 2.0](https://v2.tauri.app/) — bridging native capabilities with web technologies.
* **Database:** [SQLite](https://www.sqlite.org/) — reliable local storage for metadata and sync states.

## 📱 Platform Support
| Platform | Status | Environment |
| :--- | :--- | :--- |
| **Android** | 🛠 Development | Tested on Samsung A55 |
| **Windows** | 🛠 Development | Windows 11 |
| **Linux/macOS** | 📅 Planned | — |

## 🧪 Project Status & Experiments
Aivys is currently in an **experimental phase**. The primary goal is to explore:
- High-performance file system scanning on Android using Rust.
- Reliable local data synchronization without centralized servers.
- Minimalist and efficient UI for large offline music collections.

## 🏗 Development Setup

### 1. Prerequisites
Before running the project, ensure you have the following installed:
* **Rust:** [rustup](https://rustup.rs/) (stable channel).
* **Node.js:** v18 or newer.
* **Android Studio:** * **SDK Platform:** API 34 or 35.
    * **SDK Tools:** Android SDK Build-Tools, NDK (Side by side), and CMake.
* **Environment Variables:**
    * `ANDROID_HOME` pointing to your SDK location.
    * `NDK_HOME` pointing to the specific NDK version (e.g., `...\ndk\26.x.x`).

### 2. Initial Setup
```powershell
# Clone the repository
git clone [https://github.com/cestxde/aivys.git](https://github.com/cestxde/aivys.git)
cd aivys

# Install dependencies
npm install

# Initialize Android project files (required once after cloning)
npm run tauri android init
```

### 3. Running the App

#### **Windows**
```powershell
npm run tauri dev
```

#### **Android**
To run on a physical device (e.g., Samsung A55), ensure it is connected via USB with Debugging enabled.
```powershell
npm run tauri android dev
```
> **Note:** If you have multiple network adapters (VPN, Radmin, VM bridges), ensure your primary Wi-Fi/Ethernet adapter has the highest priority (lowest Metric) in Windows settings.

## ⚖️ License & Trademark
This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

**Branding Notice:** The "Aivys Player" name, logos, and all graphical assets are protected. Their use is subject to the guidelines outlined in [BRANDING.md](BRANDING.md).