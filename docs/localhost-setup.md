# PassGuard — independent local startup

This project runs on **your own computer** with Node.js 20+ and a normal browser. It has no Arena URL, account, agent, cloud, Python, database, build, or browser-automation requirement. The existing application was preserved, not recreated. The assistant edited the Arena workspace copy; your unmounted Kali filesystem was **not** modified remotely.

## Apply the update to your existing Kali folder

Download **`passguard-local-startup-update.zip`** into `~/Downloads`. It contains only new/changed launcher, configuration, test, documentation and evidence files. It does not contain or overwrite `index.html`, `css/`, `js/`, or `assets/`.

Back up first, then overlay the files:

```sh
cd ~/Downloads
tar --exclude='passguard/node_modules' \
  -czf "passguard-backup-$(date +%Y%m%d-%H%M%S).tar.gz" passguard &&
unzip -o passguard-local-startup-update.zip -d passguard
```

Confirm the backup/extraction succeeded. If you customized `package.json`, review/merge its script changes instead of blindly overwriting your own dependencies/scripts. The complete **`passguard.zip`** is also supplied as a source snapshot; use the focused overlay to preserve your existing application files.

## Start locally on Kali / Linux

Install Node locally if necessary and verify `node --version` is 20+. Prefer a currently supported LTS release. With Node installed, no npm package installation or Internet connection is needed to start:

```sh
cd ~/Downloads/passguard
chmod +x start-passguard.sh
./start-passguard.sh
```

The script starts **http://localhost:3000**, bound to **127.0.0.1**, and requests your default desktop browser (set Firefox as your OS default if preferred). Keep this terminal open. If execution permission was lost, `bash ./start-passguard.sh` also works.

```sh
# Start without a browser-opening request:
./start-passguard.sh --no-open
# Or use either npm alias:
npm start
npm run dev
# npm with optional browser opening:
npm run start:open
```

The OS script uses its own directory and supports paths containing spaces, so you can invoke it by absolute path from another working directory. Do not copy only the shell script away from the project: it needs the adjacent server/helper and application files.

### Startup outcomes

1. **Port 3000 free:** bind successfully, print the confirmed localhost URL, stay in the foreground.
2. **Already serving PassGuard:** print **already running**, reuse that instance, and exit successfully without creating another server. This new invocation is not the owner of the old server.
3. **Another app/unverified listener:** print the port conflict and exit **73**. No process is killed and there is no automatic fallback to 8000. Use `ss -ltnp` to identify the owner and stop it only if appropriate.

Detection uses a bounded read-only local identity request; legacy servers can be recognized by an **exact homepage-byte match**, not just a title. Both IPv4 and IPv6 loopback are checked because localhost may resolve to either. No remote redirects are followed. Identity is duplicate prevention, **not authentication**, and grants no process-control authority.

An optional explicit alternative is `./start-passguard.sh --port 8000`, but this deliberately changes the URL to localhost:8000. It is not an automatic fallback. Npm accepts `PORT=8000 npm start` or `npm start -- --port 8000`.

### Browser behavior

Linux GUI sessions use `xdg-open`, with `gio open` as a fallback when the first executable cannot start. Windows uses its default URL handler. Headless/CI sessions skip the request; if a desktop helper cannot open a tab, manually open **http://localhost:3000**. The server does not depend on this request succeeding, and a helper launch is not proof that a browser tab opened. No browser driver, Playwright, or downloaded testing browser is involved in normal startup.

## Stop and restart locally

**Foreground shell/npm/Windows startup:**

1. Press **Ctrl+C in the terminal that owns the server**.
2. Wait for **PassGuard stopped.** Closing a browser tab alone does not stop it.
3. Restart with `./start-passguard.sh` (or `npm start` / `start-passguard.bat`).

If a second invocation said **already running** and exited, it owns nothing to stop. Return to the original terminal, or use the user-service commands below if that service owns it. The launcher deliberately has no broad `killall`, guessed PID file, or HTTP shutdown endpoint. Stop an old owning process before expecting changed server code to take effect. Reuse preserves the existing owner's bind address and configuration; stop/restart that owner to change them.

Refresh the browser after changing static HTML/CSS/JS. Restart the owner after changing server/helper files. There is no bundler or hot-module-replacement dependency.

## Windows

Install Node.js 20+, open a fresh Command Prompt, and run:

```bat
cd /d "%USERPROFILE%\Downloads\passguard"
start-passguard.bat
```

Double-clicking the batch launcher is also intended to work. It uses the same loopback/port/duplicate checks and keeps a console for Ctrl+C; errors remain visible. Use `start-passguard.bat --no-open` to suppress browser opening. Npm start/dev are alternatives.

The batch file and Windows command selection were checked structurally on Linux, **not executed on a real Windows OS**. Native Windows console/default-browser behavior therefore remains a manual check; this is not claimed as Windows certification.

## Optional Linux auto-start on login

**Nothing is automatically installed or enabled.** The template is `docs/systemd/passguard.service.example`; it is for a normal systemd **user** session, not a root/system-wide daemon. First verify the app works in a foreground terminal, then stop that foreground instance.

1. Check `command -v node` and `node --version`. Edit the template's `/usr/bin/node` if your Node binary lives elsewhere (for example, in a version manager). A user service does not load your interactive shell's nvm configuration.
2. Check that both template paths point to your actual project. `%h/Downloads/passguard` assumes the documented folder. Do not leave an example path that differs from yours.
3. Install/enable only if desired:

```sh
cd ~/Downloads/passguard
mkdir -p ~/.config/systemd/user
cp -i docs/systemd/passguard.service.example \
  ~/.config/systemd/user/passguard.service
# Review/edit the copied file if your Node or project path differs.
systemctl --user daemon-reload
systemctl --user enable --now passguard.service
systemctl --user status passguard.service
```

The user service binds to **127.0.0.1:3000**, opens no browser, and can restart after an unexpected failure. `--require-new` prevents it from adopting a terminal-owned server; exit 73 prevents retry loops when the port belongs to another process. Stop the old terminal/service owner before starting a new supervised instance. Open Firefox manually or run the shell launcher to open/reuse the service's app.

```sh
# Stop this service's own instance:
systemctl --user stop passguard.service
# Start it again:
systemctl --user start passguard.service
# Restart after server changes:
systemctl --user restart passguard.service
# Read its startup/shutdown diagnostics (not passwords/access logs):
journalctl --user -u passguard.service -n 50 --no-pager
# Easily disable login auto-start and stop its current instance:
systemctl --user disable --now passguard.service
```

Optional complete removal after disabling:

```sh
rm -- ~/.config/systemd/user/passguard.service
systemctl --user daemon-reload
```

No `sudo`, `loginctl enable-linger`, boot-time/system service, or registry change is configured. This template was not enabled on the sandbox or on your Kali machine; a real user-systemd login cycle remains a manual check.

## Network preview is optional, never a dependency

Only for an intentional trusted network/hosted preview:

```sh
HOST=0.0.0.0 PORT=3000 npm run dev -- --no-open
```

That exposes the listener on network interfaces. It is not the normal local default, and plain HTTP on a LAN IP may disable secure-context browser capabilities. Arena uses this explicit override only for its own preview; local startup works without Arena. The OS wrappers force 127.0.0.1:3000 unless you explicitly supply different CLI flags.

## Tests, source preservation, and privacy

```sh
npm test
npm run test:local
# Original transport tests alone:
npm run test:server
```

These use Node built-ins and synthetic fixtures. Existing tests were preserved; the default-port expectation changed from implicit 3000→8000 fallback to fixed 3000 to match this requirement. New tests cover duplicate/race/conflict behavior, strict identity/legacy matching, bounded local probes, IPv6 conflicts, supervisor ownership, real Linux path/cwd/stop/restart behavior, and optional opener failures. Windows GUI behavior and user-systemd login are not inferred from those Linux tests.

For the existing **optional** browser suites only, install the already-pinned development tools with `npm ci`, download test browsers with `npx playwright install chromium firefox`, and run `npm run test:browser` / `npm run test:firefox` while the local server is up. Linux testing libraries may be required by those test browsers; they are not needed by PassGuard's Node launcher or by your already-installed Firefox.

All 25 existing frontend runtime files and the package lock are preserved. Analysis/generation/state/report behavior stays browser-local; no raw password/full hash is transmitted or logged. The optional external exposure check remains explicit and prefix-only. Tests use mocked breach responses, never real credentials or live service queries. There are no new npm/runtime dependencies, secret keys, credential APIs, persistence, or access/request logs. The read-only identity endpoint returns only application/service/protocol labels.

See [actual results and exact changed-file inventory](test-results.md), [HTTP/source checks](localhost-http-results.json), [native TAP](unit-test-results.txt), [Chromium evidence](browser-test-results.json), and [Firefox evidence](firefox-test-results.json). Remaining manual boundaries include your actual Kali Firefox/profile, real GUI/browser permissions, Firefox clipboard success (mocked in automation), native print/PDF dialogs, Windows and login auto-start, Safari/physical devices/assistive technology, and live service reachability.
