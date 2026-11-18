# Glock-launcher

A fast, no-nonsense Minecraft launcher for **Windows and Linux**, built with Electron.

Glock-launcher keeps everything you need in one window: separate instances for every version and loader, a built-in mod/shader/modpack browser powered by Modrinth, automatic Java handling, world backups, a crash analyzer and a handful of performance helpers. It starts quickly, stays out of your way, and does not need an account to browse, install or play.

> Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. If you enjoy the game, please buy it and support the developers.

## Contents

- [Features](#features)
- [Download](#download)
- [Run from source](#run-from-source)
- [Build installers](#build-installers)
- [Where your data lives](#where-your-data-lives)
- [Linux notes](#linux-notes)
- [Windows notes](#windows-notes)
- [Security](#security)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

## Features

### Instances

- One instance per Minecraft version and loader: **Vanilla, Fabric and Quilt**.
- Release versions, with an optional switch to show snapshots.
- Per-instance settings: RAM, Java path, custom JVM arguments, window size, fullscreen, auto-join server, minimize launcher on start.
- Clone an instance, export it to a `.zip` backup, import one back.
- Playtime and last-played tracking, instance size on disk, favorites and notes.
- Grid or list view, search and sorting on the instance list.
- Quick access to the instance folder, saves, screenshots, mods, shader packs and resource packs.

### Mods, shaders, resource packs and modpacks

- Search and install straight from **Modrinth**: mods, shaders, resource packs and `.mrpack` modpacks.
- Required dependencies are installed together with the mod; a dependency you already added by hand is left alone.
- Every download is checked against the SHA-1 published by Modrinth.
- Update checker for installed mods, with one-click apply.
- Enable, disable or delete mods one by one, or switch all of them at once.
- Drag and drop `.jar` files onto the window to add them to mods, `.zip` files to resource packs.
- Modpack installer creates a ready instance with its own mods and overrides.
- Optional bundled mods for Minecraft 1.21.4 (put `.jar` files in `bundled-mods/1.21.4/`); they are copied into new Fabric/Quilt instances and never override a mod you disabled.

### Java

- Scans the system for installed Java runtimes (Program Files and `JAVA_HOME` on Windows; `/usr/lib/jvm`, SDKMAN, asdf, mise, Flatpak and others on Linux).
- Picks a Java that matches the Minecraft version (8, 17 or 21).
- If nothing suitable is installed, downloads an **Eclipse Temurin JRE** automatically, verifies its SHA-256 and keeps it inside the launcher folder.
- Drops JVM flags that the detected Java cannot run (for example ZGC flags on Java older than 21).

### Performance

- **FPS Boost**: installs Sodium, Lithium, FerriteCore, ModernFix, Entity Culling and ImmediatelyFast in one go, dependencies included (Fabric/Quilt).
- Graphics presets that rewrite `options.txt` (an FPS preset and a balanced one).
- RAM guard: the launcher refuses to give the game more memory than the system can spare and warns when a large heap is likely to hurt FPS.
- On Windows the game runs with high priority while the launcher drops to low priority when minimized.
- Economy mode that turns off animations and transitions.
- Cleanup tool for temporary files and logs older than 14 days.

### Worlds, screenshots and backups

- World list with last-played time and icons, plus per-world backup to `.zip` and delete.
- Screenshot gallery for each instance.
- Backup manager: list, restore or delete archives of instances and worlds.
- Deleting uses the system trash where available.

### Diagnostics

- **Crash analyzer** reads the end of `latest.log` and points out common problems with a suggested fix: out of memory, wrong Java version, missing or duplicated mods, missing Fabric API, mixin failures, bad JVM arguments, GLFW/OpenGL errors and network problems.
- Live game log with error/warning highlighting; save or copy it with one click.
- System info for bug reports (OS, CPU, RAM, Electron and Chromium versions).

### Quality of life

- Multiple local profiles with nicknames and a skin head preview.
- Server list with online status and player count.
- Command palette and toast notifications.
- Custom accent color and several built-in color themes.
- **Desktop shortcuts** that start a specific instance directly, without opening the launcher window.
- Single-instance protection so two launchers never fight over the same files.
- Window size and position are remembered.
- Polish interface.

### Accounts

Glock-launcher currently uses **offline-mode nicknames**. There is no Microsoft sign-in yet, so online-mode servers that require authentication will not accept the profile.

## Download

Grab the latest build from the [Releases](https://github.com/olekibolekkielbasakran/Glock-laucher/releases) page.

| Platform | Files |
| --- | --- |
| Windows (x64) | NSIS installer (`Glock-launcher-Setup-<version>.exe`) and portable build |
| Linux | `.deb`, `.AppImage` and `.tar.gz` |

**Windows SmartScreen.** The installer is not code-signed yet, so Windows may show "Windows protected your PC" or "Unknown publisher". Choose *More info* and then *Run anyway*. You can compare the file's SHA-256 with the one published in the release notes. Builds are produced from this repository by `electron-builder`.

## Run from source

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/olekibolekkielbasakran/Glock-laucher.git
cd Glock-laucher
```

Then simply run the starter for your system. On the first launch it installs the dependencies by itself.

- **Windows:** double-click `START.bat`
- **Linux:** `./START.sh` (make it executable first with `chmod +x START.sh`)

Or by hand:

```bash
npm install
npm start            # Windows
npm run start:linux  # Linux (adds --no-sandbox)
```

## Build installers

```bash
npm run dist:win     # NSIS installer + portable, x64
npm run dist:linux   # deb, AppImage, tar.gz
npm run dist:deb     # deb only
npm run pack         # unpacked build in dist/, handy for testing
```

Output goes to `dist/`.

## Where your data lives

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\.glock-launcher` |
| Linux | `$XDG_DATA_HOME/glock-launcher` (default `~/.local/share/glock-launcher`) |

Inside you will find `instances/`, `backups/`, `versions/`, a `java/` folder with runtimes downloaded by the launcher, and `settings.json`. Removing the folder resets the launcher; your normal `.minecraft` is never touched.

## Linux notes

- `START.sh` runs Electron with `--no-sandbox`. The npm build of Electron has no SUID `chrome-sandbox`, and recent Ubuntu releases restrict unprivileged user namespaces, so without the flag the window may not open.
- Wayland is detected automatically. To force X11 run `GLOCK_X11=1 ./START.sh`.
- When started from npm or as an AppImage, the launcher creates its own `.desktop` entry so the window gets the right icon.
- If no Java is found you can install one yourself, for example:
  - Debian/Ubuntu: `sudo apt install openjdk-21-jre`
  - Fedora: `sudo dnf install java-21-openjdk`
  - Arch: `sudo pacman -S jre21-openjdk`

  or let the launcher download Temurin for you.
- If the game fails with a GLFW or `libGL` error, install Mesa or the proprietary NVIDIA driver and log in again.

## Windows notes

- Run the installer, or use the portable build if you do not want to install anything.
- If the game fails with a GLFW/OpenGL error, update the graphics driver (the "Microsoft Basic Display Adapter" driver is not enough).
- Antivirus software sometimes locks files while the launcher writes them; the launcher falls back to a direct write when an atomic rename is blocked.

## Security

The launcher is a local app that talks to a few public APIs, so it is built to stay inside that role:

- Context isolation and the Chromium sandbox are on, Node integration is off, and the renderer only sees a fixed list of IPC channels.
- Strict Content-Security-Policy: scripts only from the app itself, network requests only to Modrinth and the server-status API.
- Downloads use HTTPS only; Modrinth files are verified by SHA-1, the Java runtime by SHA-256.
- Modpack archives are unpacked with path checks, and files are accepted only from the hosts allowed by the `.mrpack` specification.
- Backup and instance operations accept only names inside the launcher's own folders.
- The page cannot request camera, microphone or other browser permissions.

Found a vulnerability? Please open a private security advisory on GitHub instead of a public issue.

## Project layout

```
main.js          main process: IPC handlers, Java, launching, downloads
preload.js       the only bridge between the UI and the main process
index.html       interface markup and styles
app.js           interface logic
features.js      extra interface features (palette, themes, mod list, shortcuts)
theme.css        visual theme overrides
bundled-mods/    optional mods copied into new instances
START.bat / START.sh   starters for Windows and Linux
```

Built with [Electron](https://www.electronjs.org), [minecraft-launcher-core](https://github.com/Pierce01/MinecraftLauncher-core) and [adm-zip](https://github.com/cthackers/adm-zip). Mod data comes from the [Modrinth API](https://docs.modrinth.com), Java builds from [Adoptium](https://adoptium.net), server status from [mcsrvstat.us](https://mcsrvstat.us).

## Contributing

Bug reports and ideas are welcome in the issue tracker. For a bug, it helps a lot to include your operating system, the launcher version, the Minecraft version and loader, and the output of the crash analyzer or the saved log.

Pull requests are fine too. Keep changes focused and check that the launcher still starts on both Windows and Linux.

## License

MIT. See the `LICENSE` file.
