# Deskly

A desktop organiser and launcher for Windows 11. It sorts everything on your desktop (and everything
installed on the PC) into categories, shows it as glass panels **on the desktop itself**, keeps an eye on
performance, and gets you to anything with one shortcut.

## Run

Installer: `release/Deskly-Setup-<version>.exe`. Portable: `release/Deskly-<version>.exe` (double-click, no installer).
Run either normally, not "as administrator".

```bash
npm install        # first time only
npm run dev        # hot-reload UI + Electron
npm start          # build the UI and run the app
npm run dist       # build the installer and the portable exe into release/
npm run selftest   # read-only: prints how every desktop item is categorised
```

## What it does

**Desktop panels** (sidebar → *Desktop panels*): each category becomes a glass panel on the desktop (the native
icons are hidden while Deskly runs; quitting brings them back). Drag a panel by its header (positions are
remembered, with snapping), double-click the header to fold it, click a tile to launch. If everything does not
fit the screen, the least important panels fold themselves automatically.

**Hub layout** (default, *Panels → Layout*): instead of ten separate panels, one tabbed **Hub card** holds every
category (icon tabs, so it stays small) and the widgets stack on the other side. Choose its position (left / center /
right) and the tile size (**Comfortable**, **Compact**, **Mini**: icons only). *Classic* brings back one panel per
category. Hover a tile for a mini toolbar: show in folder, run as administrator, close the app (if it is running),
peek inside a folder (a small window lists the folder's contents with real thumbnails, no Explorer needed).

**Dock**: a floating bar above your windows with search, your favourites and most-used apps (running dot), Performance,
All apps, Scenes and a hide/show-panels button (also `Ctrl+Alt+H`). Optional auto-hide.

**Dev workflow** (sidebar → All apps → Projects, and Performance):
- **Project workspaces**: set up once per project what *Launch* does: open VS Code, a terminal in the folder, some
  links, and start the dev server (a start command, suggested from `package.json`). Deskly only runs the command you
  saved, only when you click Launch, in that project's folder.
- **Servers started from Deskly** (Performance → Dev servers): live logs, the detected port with an *Open* button,
  Stop / Start again. They stop when Deskly quits, so nothing is left running unseen.
- **Git overview**: every project shows uncommitted files, commits to push, commits to pull (as of the last fetch)
  and branches that were never pushed, with a "needs attention" summary.
- **Node cleanup** (Performance → Cleanup): groups the many `node.exe` processes by the app that started them. Helpers
  whose app has closed (leftover MCP servers, language servers…) are preselected as safe to end; helpers of running apps
  are shown but never preselected.

**Automation** (sidebar → Automation):
- **Auto-scenes**: "when Steam is running, switch to Gaming", "when I unplug the laptop, switch to Work", "on weekdays
  22:00–06:00, switch to Everything". A rule fires when its condition *becomes* true, so you can still change the
  scene by hand afterwards; with *switch back afterwards* the earlier scene returns when the condition ends (only if
  you did not pick another one in the meantime). Rules can be switched off or deleted; the page shows a short log of
  what ran.
- **Smart Quick access**: what you launch at a given time of day (morning / afternoon / evening / night) counts more
  at that time, so the Quick access list follows your habits. Can be switched off.
- **Quiet alerts** (each can be switched off, long cool-downs so nothing nags): memory at 90% or more for about a
  minute and a half (names the biggest user), a drive under 10% free, a dev server running for more than 8 hours,
  and leftover helper processes worth 2 GB or more. Clicking a notification opens Performance. Nothing is checked
  during the first minute after start.

**System health** (Performance → Startup and This week; Automation):
- **Startup impact** (Performance → Startup): every startup program gets a **High / Medium / Low** estimate, sorted
  by impact, with a one-line summary of the heavy ones. It is an estimate from what each program has used since it
  started: processor time (only counted for programs that started with Windows) and memory. Browsers are judged on
  processor time only, because their memory grows with your tabs. Programs that are not running, or are scripts, are
  shown as "Unknown". Turning an entry off only stops it launching at sign-in, and is reversible.
- **This week** (Performance → This week): a plain-language report of the last 7, 14 or 30 days: memory and processor
  averages and peaks, hours spent above 85% memory, the hottest graphics reading, time on battery, change in free
  space per drive, the programs that held the most memory, and a few sentences on what stands out. *Copy report*
  puts it on the clipboard. Deskly takes one reading every 5 minutes while it runs (kept 35 days, on this PC only), so
  the report starts filling in after the first day. Optional notification once a week once there are 3 days of data.
- **Battery and heat scenes** (Automation): *"when the battery is at 20% or less"* (only while on battery) and
  *"when the graphics card is at 80°C or more"* (NVIDIA cards; starts after three hot readings in a row, ends 5°
  under the limit so it does not flip back and forth). A **Light mode** scene (quiet desktop, just the clock) is added
  for both; the *switch back afterwards* option returns to your earlier scene. Deskly does not change Windows
  power modes.

**File cleanup** (sidebar → File cleanup). Nothing here deletes anything: files are moved (and can be moved back)
or sent to the Recycle Bin.
- **Downloads**: previews, then sorts loose files into folders inside Downloads (Installers, Documents, Images,
  Videos, Audio, Archives, Design files, Code and data). Half-finished downloads, files with secret-looking names and
  recent files (you choose how recent) stay put; unknown types are listed but not preselected. Name clashes get a
  number, never an overwrite.
- **Screenshots**: finds `Screenshot…`, `Capture d’écran…`, `Snip…` images on the Desktop, Downloads and Pictures
  (including ones loose in Pictures\Screenshots) and files them into `Pictures\Screenshots\YYYY-MM`.
- Every sort is recorded in *Recent moves*, with **Undo** (also removes the folders it created).
- **Duplicates**: finds byte-identical photos, videos, audio, documents and archives (and loose installers) in
  Desktop, Downloads, Documents, Pictures, Videos and Music. Files are compared by size, then a sample, then a full
  hash. Program files inside app folders are never offered. One copy of every set always stays; the suggested keeper
  is the oldest copy outside Downloads and Desktop, and you can pick another. Removed copies go to the Recycle Bin.
- **Big and old**: the largest files (100 MB and up, your choice) and anything over 20 MB untouched for a year.
  Nothing is preselected. Files that look like part of a program are tagged.
- Files that only exist in the cloud (OneDrive placeholders) are never opened or listed, so nothing is downloaded.
  Before removing anything Deskly checks the file is unchanged since the scan.

**Widgets** (live, on the desktop): *System* (CPU, RAM, GPU, disks, battery, top memory users), *Dev servers*
(Vite/Next/Node/Python servers with port, project, memory, uptime; open, copy URL, stop), *Projects* (git
projects with branch and uncommitted changes; open in VS Code / terminal / folder), *Recent* files, *Clock* with
optional weather.

**Scenes** (Work / Gaming / Content / Everything, or your own): one click reshapes the desktop (which panels and
widgets show) and can open apps. Switch from the Scenes page, the tray menu, search, or `Ctrl+Alt+1…9`.

**Search anywhere** (`Alt+Space`, or the first free of `Ctrl+Alt+Space` / `Ctrl+Shift+Space` / `Alt+Shift+Space`;
another app such as Microsoft 365 Copilot may own `Alt+Space`): launches any app, game, project, Chrome profile,
scene or command. Ranked by how you use it.

**All apps** (sidebar → Tools): every program, Store app, Steam/Epic game, Chrome profile and git project on the
PC, with real icons. The pin adds an app to a desktop panel.

**Performance** (sidebar → Tools): live overview, the programs using the most CPU / memory / GPU (with an "End"
button that asks twice and refuses Windows system programs), dev servers, **startup apps** (turn entries on/off,
fully reversible), and a **storage cleaner** (`node_modules`, build output, npm/pip/Electron caches; project
folders go to the Recycle Bin, tool caches are removed because they re-download).

**Customize** (sidebar): *Panels* (transparency, snap, lock, per-panel name / colour / view, widgets, weather city,
search shortcut) and *Rules* (your own sorting rules, auto-sort of new shortcuts).

**Tidy desktop** (optional): previews, then moves loose shortcuts into one folder per category on the desktop.
Never deletes, never moves folders or secret-looking files (`client_secret*`, `.env`, keys…), skips name
clashes, and every tidy can be undone. Shared Public Desktop items need administrator rights to move.

## Install, updates and moving to a new PC

- **Two ways to run it**: `Deskly-Setup-<version>.exe` installs for your user only (no administrator rights, Start menu
  shortcut, no desktop shortcut, choose the folder, clean uninstall that also removes the "start with Windows" entry);
  `Deskly-<version>.exe` is the portable version.
- **Updates** (Panels → Updates, installed version only): checks twice a day which version is newest on the GitHub
  release page configured in `package.json` (`build.publish`), and nothing else. It never downloads or installs on its
  own: you click *Download*, then *Restart and install*. Can be switched off. The portable exe cannot update itself.
  Releases are not code-signed yet, so Windows SmartScreen may warn on a new installer; downloads are verified against the
  checksum in the release.
- **Welcome tour**: five short steps on a brand-new install (layout, desktop panels, shortcuts). Existing setups skip it;
  *Panels → Your setup → Show the welcome tour again* replays it.
- **Several screens**: *Panels → General → Show panels and dock on* chooses the screen (the main one by default). If it is
  unplugged, Deskly moves to the main screen and goes back when it returns; its layout starts fresh on a different
  screen. Search and the folder peek open where your mouse is.
- **Export / import your setup** (Panels → Your setup): saves layout and look, categories and rules, favorites, scenes,
  automation and (optionally) project workspaces into one JSON file. Import lets you pick which parts to load, makes a
  backup of the current setup first and offers *Undo the import*. Imported files are checked strictly: unknown or
  out-of-range values are dropped and nothing is executed. Project workspaces hold start commands that run when you click
  Launch, so they are off by default and flagged. Usage history, file moves, health history and screen positions are
  never exported.

To publish an update: set the GitHub owner/repo in `package.json`, run `npm run dist`, and upload
`Deskly-Setup-<version>.exe` and `latest.yml` (and the `.blockmap`) from `release/` to a new GitHub release tagged
`v<version>`.

## Notes

- If the icons ever stay hidden: right-click the desktop, *View → Show desktop icons*.
- Closing the window keeps Deskly in the tray (switch off under *Panels → General*). *Quit* is in the tray menu.
- The sampler behind the System widget and Performance page only runs while something shows it (~0.3% of a
  16-core CPU). Per-process GPU use is only measured while the Performance page is open.
- Weather uses open-meteo.com and is only requested if you enter a city.
- Settings live in `%APPDATA%\Deskly`.

## Layout

- `electron/` main process: `main.cjs` (windows, IPC, tray, hotkeys, scenes), `panels.cjs` + `winshell.cjs` (panels on
  the desktop via `koffi`), `scanner.cjs` + `icons.ps1` (desktop scan, 256px icons), `library.cjs` (all apps/games/
  projects/Chrome/recent), `sysmon.cjs` + `sample.ps1` (live monitor), `cleaner.cjs`, `workspaces.cjs` (workspaces + managed servers), `procgroups.cjs` + `procs.ps1` (node cleanup), `startup.cjs` + `startup.ps1`,
  `dock.cjs` (floating dock), `automation.cjs` (auto-scene rules), `alerts.cjs` (quiet notifications), `health.cjs` (battery/heat probe, history, weekly report), `setup.cjs` (export/import), `displays.cjs` (which screen), `updater.cjs` (updates), `impact.ps1` (startup estimate), `files.cjs` (Downloads/screenshots sorting, duplicates, big files), `tidy.cjs`, `categories.cjs` (sorting rules), `widgets.cjs`, `store.cjs`.
- `src/` React UI. Outside Electron it runs on sample data so the design can be previewed in a browser.
- `scripts/make-icon.cjs` generates `build/icon.png`.

To change the built-in sorting, edit `RULES` in `electron/categories.cjs` (or add rules in the app).
