<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo-white-ru.svg">
    <img alt="Aivys Player" src="src/assets/logo-black-ru.svg" width="350">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>Русский</strong>
</p>

**Aivys** — кроссплатформенный офлайн-плеер на **Rust** и **Tauri 2**. Без облачных сервисов: локальная библиотека, сканирование, воспроизведение, теги, плейлисты и статистика. Данные библиотеки лежат рядом с музыкой в переносимой папке **`.aivys/`**.

## Данные библиотеки и удобство синхронизации

Aivys **не** делает свою сеть синхронизации. Пользовательские данные (прослушивания, минуты, избранное, теги, плейлисты и т.д.) хранятся в **`.aivys/`** рядом с файлами — в формате, который удобно копировать уже привычными средствами: [Syncthing](https://syncthing.net/), общая папка, NAS и т.п.

Формат **файловый**, описан в [`docs/aivys-format.md`](docs/aivys-format.md): журналы событий по устройствам, отдельные файлы плейлистов и тегов, плюс разбор **conflict-копий Syncthing**, чтобы одновременная работа с разных устройств не молча портила библиотеку. SQLite на каждом устройстве — пересобираемый **индекс/кэш**, а не источник истины.

## Стек

* **Бэкенд:** [Rust](https://www.rust-lang.org/) — сканирование, метаданные, хранилище `.aivys/`.
* **Фронтенд:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/).
* **Оболочка:** [Vite](https://vitejs.dev/) и [Tauri 2](https://v2.tauri.app/).
* **Индекс:** [SQLite](https://www.sqlite.org/) — поиск и производное состояние из журналов.

## Платформы

| Платформа | Статус | Заметки |
| :--- | :--- | :--- |
| **Android** | В разработке | Проверялся на Samsung A55 |
| **Windows** | В разработке | Windows 11 |
| **Linux / macOS** | В планах | — |

## Статус проекта

Проект **экспериментальный**. Сейчас в фокусе:

- нормальный офлайн-UX библиотеки на ПК и Android;
- устойчивый файловый формат, удобный для библиотек на нескольких устройствах;
- скорость сканирования больших папок (особенно на Android).

## Разработка

### Что нужно

* **Rust:** [rustup](https://rustup.rs/) (stable).
* **Node.js:** v18 или новее.
* **Android Studio** (для сборок под Android):
    * SDK Platform API 34 или 35;
    * SDK Build-Tools, NDK (side by side), CMake.
* **Переменные окружения:**
    * `ANDROID_HOME` → Android SDK;
    * `NDK_HOME` → версия NDK (например `...\ndk\26.x.x`).

### Первый запуск

```powershell
git clone https://github.com/cestxde/Aivys.git
cd Aivys

npm install

# Файлы Android-проекта (один раз после клона, если собираете под Android)
npm run tauri android init
```

### Запуск

**Windows**

```powershell
npm run tauri dev
```

**Android** — устройство по USB с отладкой:

```powershell
npm run tauri android dev
```

> Если много сетевых адаптеров (VPN, Radmin, мосты ВМ), у основного Wi‑Fi/Ethernet должен быть наивысший приоритет (наименьшая метрика), иначе Android-dev может не достучаться до ПК.

Релизы: [`docs/releasing.md`](docs/releasing.md).

## Лицензия и бренд

Лицензия **MIT** — см. [LICENSE](LICENSE).

Имя «Aivys Player», логотипы и связанные материалы — по правилам [BRANDING.md](BRANDING.md).
