# PassGuard — independent local startup verification

## Executed status and scope

The **existing** 52-file project was inspected before editing: package/lock, server launcher, startup documentation, test scripts, current port/processes, HTML/CSS/module references and application security boundaries. No application was recreated. Baseline: **77/77 native tests passed**. The existing port-3000 process was first recognized/reused without duplication, then deliberately restarted to test the updated Node code.

All tests here ran in the **Arena Linux sandbox**, not the user's unmounted Kali filesystem. Local deliverables are self-contained Node/OS scripts and do not depend on Arena or a hosted URL. Normal runtime needs Node 20+ and a browser only: **zero npm/runtime dependencies, no cloud, Python, build, browser driver, credential API, database, or paid service**.

| Verification actually executed | Result |
| --- | --- |
| Complete native suite | **99/99 passed**, 0 failed/cancelled/skipped |
| Targeted local/transport suite | **38/38 passed**; included in the 99, not 38 additional cases |
| Existing Chromium 156.0.8078.4 suite | **22/22 integration groups passed**, 0 failed; record `2026-10-17T12:04:10.283Z` |
| Existing Firefox 157.0 suite | **22/22 integration groups passed**, 0 failed; record `2026-10-17T12:04:19.418Z` |
| Browser target | **http://localhost:3000** in both runs |
| Accessibility | **23 axe scans per browser**, 0 detected violations for configured WCAG 2 A/AA and 2.1 A/AA tags; not certification |
| Reflow | **60 view/width combinations per browser**, no horizontal overflow: ten sections × 320/360/390/768/1024/1440 CSS px |
| Syntax | **31 JavaScript modules** passed `node --check`; Linux launcher passed `bash -n` |
| HTTP | **25/25 runtime files**: 200, correct MIME, byte-identical to workspace; fixed identity endpoint and hosted-preview Host also 200 |
| Source preservation | All **25 frontend runtime files** and `package-lock.json` SHA-256 unchanged; existing browser runner and six original application-native suites preserved |
| Duplicate prevention | Actual repeated shell / npm start / npm dev launches reused the same port-3000 listener; no duplicate server |
| Cold-start races | Two simultaneous real CLI starts converged to one server and one successful reuse |
| Conflict safety | Foreign/title-only/malformed/silent/oversized/redirected and IPv6-only listeners rejected; other apps left intact; CLI exit **73**, no automatic port switch |
| Linux lifecycle | Real shell start/reuse/Ctrl+C/stop/restart from another cwd and a path with spaces passed; inherited HOST/PORT did not change wrapper defaults |
| Browser opener | Native-command selection/fallback/failure checked with mocks; real headless shell invocation safely skipped opening and reused the server |
| Optional auto-start | User-service template supplied, structurally checked, **not installed/enabled or tested through a real login cycle** |
| Windows | Batch quoting/defaults and command selection checked on Linux, **not executed on Windows** |
| Dependency audit | Full and runtime-only npm audits: **0 known vulnerabilities** at execution time; no new npm dependency was added |

The timestamp strings above are the runner's recorded UTC values, not claims about the user's computer. Raw evidence links appear below. Tests are evidence, not an independent security/accessibility certification.

## Exact source changes

**Modified existing files (17):**

- `README.md`
- `docs/architecture.md`
- `docs/browser-test-results.json`
- `docs/firefox-test-results.json`
- `docs/localhost-http-results.json`
- `docs/localhost-setup.md`
- `docs/manual-testing.md`
- `docs/screenshots/mobile-firefox.png`
- `docs/screenshots/mobile.png`
- `docs/screenshots/overview-firefox.png`
- `docs/screenshots/overview.png`
- `docs/security-audit.md`
- `docs/test-results.md`
- `docs/unit-test-results.txt`
- `package.json`
- `scripts/dev-server.mjs`
- `tests/dev-server.test.js`

**Added files (5):**

- `docs/systemd/passguard.service.example`
- `scripts/local-startup.mjs`
- `start-passguard.bat`
- `start-passguard.sh`
- `tests/local-startup.test.js`

The modified images are real cleared-state captures from rerunning the existing browser suites, not UI source changes. No entered password is saved in them. All six preexisting application-native suites remain byte-identical. The existing 16 transport tests were retained; only their default-port name/expectation changed from implicit 3000→8000 fallback to **fixed 3000**, as required by this task. Their explicit programmatic multi-port transport test still passes. The existing browser-runner source is unchanged.

## Implementation behavior

### One local server, safe ownership

- `npm start` and `npm run dev` retain the same Node entry point. `start:open` requests optional browser opening. Linux/Windows wrappers invoke that entry point with explicit **127.0.0.1:3000** defaults; no npm installation or Arena API is involved.
- The CLI inspects bounded local HTTP responses before binding. A fixed read-only app/service/protocol identity record recognizes current PassGuard; an exact local homepage-byte match supports legacy copies. An unrelated page title is insufficient. Both loopback address families are checked.
- A known instance is reused without ownership or termination. Another/unverified app causes exit **73**, without selecting an alternate port. A listen race is inspected again so two simultaneous starts do not create a second server.
- Disabled IPv6 error mapping is covered by a **simulated error-code unit test**; real IPv6-only foreign-listener detection also passed here. Unknown/reset/permission/timeouts remain conservative conflicts.
- A reused invocation exits. Stop/restart the owning terminal/service; this program has no broad killer, guessed PID file or shutdown HTTP API. Reuse does not widen an owner's binding or reload its server code.
- The optional supervisor template uses `--require-new --no-open` and `RestartPreventExitStatus=73`: it refuses to pretend it owns a preexisting terminal's server and avoids conflict restart loops. It is opt-in only.

### Static files and browser opening

The existing public index/CSS/JS/assets and relative ES modules remain intact. Root resolution is script-relative, not cwd-relative. Correct MIME, GET/HEAD, no-store/nosniff/no-referrer headers, favicon aliases, static error responses, private-path/traversal/symlink restrictions and graceful Ctrl+C/SIGTERM shutdown are retained. The only new HTTP record is a fixed read-only identity response; it exposes no PID, filesystem root, token or credential and accepts no control operation.

`--open` uses native OS URL handlers with argument arrays, not an evaluated shell/BROWSER string. It accepts only the local application URL. Headless/CI or helper failures do not make the server fail. The CLI says **browser open requested**, not that a GUI tab definitely appeared. Linux wrapper tests ran with no browser automation. Windows/native GUI and macOS behavior are not inferred from mocked command selection.

### Normal local binding versus verification preview

Local defaults and wrappers use **127.0.0.1:3000**. The verification preview in this sandbox explicitly uses `HOST=0.0.0.0 PORT=3000 npm run dev -- --no-open` because its proxy needs a network listener. This is a test/preview override, **not a local dependency or a default change**. The default loopback address was asserted on actual native-test listeners. No browser-facing code calls the sandbox's localhost API.

The pre-update process was recognized by exact legacy homepage bytes and kept unchanged during the first reuse check. After its deliberate replacement, shell/npm aliases all reused the updated identity-enabled process; the before/after listener output matched. [HTTP and lifecycle evidence](localhost-http-results.json) records these observations without password data.

## All existing application phases remain working

| Phase | Preserved and executed verification |
| --- | --- |
| Frontend/dashboard | Honest empty state, all ten routes/history, dark/light, show/hide/reset, local assets, mobile focus/keyboard skip |
| Analysis | One shared score, counts/Unicode/pattern/common checks, entropy, recommendations, outdated-result guards |
| Attack resistance | N versus N/2, four editable validated scenarios, finite logarithmic estimates and consistent risk indicators; no attacks |
| Generator | 200 synthetic outputs/all 15 category subsets, lengths 8–64, crypto rejection/shuffle/category guarantees, unavailable-RNG failure, copy/analyze/clear |
| Common/exposure | Exact local list separate from heuristics; mocked prefix-only success/negative/error/429/malformed/cancel/timeout/stale paths |
| Reports/export | Honest actual data, escaped/private preview, real HTML/text downloads read back, invalidation/clear, print styles/invocation spy, actual Chromium headless PDF |
| Tests/audit/docs | All native plus both existing browser suites, accessibility/reflow/source/privacy/audit checks, independent OS startup/lifecycle and opt-in service instructions |

## Native coverage

The original 61 application cases and 16 transport cases are retained (with the one intentional default-port expectation update). **22 new startup cases** exercise flags, GET/HEAD identity privacy, unavailable IPv6 mapping, available/current/legacy/foreign ports, wrong/malformed identity, no redirects, silent/oversized listeners, local-only probe validation, real IPv6 conflicts, idempotent ownership, foreign CLI exit 73, successful repeat invocation, supervised refusal, concurrent cold starts, actual Linux cwd/space/env/start/stop/restart, OS wrapper/service structure and optional browser command/failure behavior.

Complete [native TAP](unit-test-results.txt) reports 99 pass / 0 fail / 0 cancelled / 0 skipped. `npm run test:local` independently reports 38/38; those cases are already included in the 99.

## Existing browser groups

| # | Group | Chromium | Firefox |
| --- | --- | --- | --- |
| 1 | initial dashboard: honest empty state and no external requests | passed | passed |
| 2 | all ten navigation destinations and browser history | passed | passed |
| 3 | keyboard skip link preserves each current section and focuses main content | passed | passed |
| 4 | theme toggle and password visibility are accessible and functional | passed | passed |
| 5 | analysis, character statistics, common checks and shared score | passed | passed |
| 6 | stale analysis and report are hidden immediately on input change | passed | passed |
| 7 | attack scenarios show finite estimates and validate editable rates | passed | passed |
| 8 | generator length, categories, analysis integration and clear | passed | passed |
| 9 | Clipboard success/denial/manual-copy/async UI (Firefox success is explicitly mocked) | passed | passed |
| 10 | reset rejects late clipboard callbacks even after a new password is generated | passed | passed |
| 11 | HTML-like password input remains data and cannot inject markup or a report credential | passed | passed |
| 12 | explicit breach success and exact five-character request privacy | passed | passed |
| 13 | mocked negative, network failure, rate limit and malformed breach states | passed | passed |
| 14 | cancel and changed-input races discard late breach responses | passed | passed |
| 15 | report preview, real HTML/text downloads, privacy and clear report | passed | passed |
| 16 | Print invocation spy and actual print-media isolation; headless PDF only in Chromium | passed | passed |
| 17 | WCAG A/AA automated scans: all ten populated views in both themes | passed | passed |
| 18 | responsive layouts: every section at 320, 360, 390, 768, 1024 and 1440 pixels | passed | passed |
| 19 | mobile drawer, keyboard Escape, focus management and theme | passed | passed |
| 20 | reset clears sensitive controls, masks inputs and removes assessments/reports | passed | passed |
| 21 | missing Web Crypto fails closed while analysis and reporting remain available | passed | passed |
| 22 | clean application logs, references, storage and network boundaries | passed | passed |

Both suites exercised all 16 delegated actions, direct controls and all ten routes. Each recorded 0 uncaught JS errors, unexpected console errors, missing local-file responses or unexpected external requests. Deliberate mocked network/429 diagnostics are classified separately by the already-existing runner: Chromium 2, Firefox 1; unrelated errors still fail.

**Clipboard:** Chromium performs a real granted-permission write, then mocked denied/pending paths. Firefox's successful Clipboard API boundary is explicitly mocked; actual Firefox permission/paste behavior remains manual. **Print:** both spy on the invocation and test actual print-media isolation. Chromium additionally rendered an actual **60,177-byte** headless PDF. Playwright Firefox cannot generate PDF; native Firefox Save as PDF and all human-operated print dialogs remain manual.

## Credential and request boundary

Frontend analysis/generation/state/report modules were preserved byte-for-byte. There is no frontend persistence, raw password/full-hash logging, credential POST, automatic exposure request or upload API. Startup identity probes are fixed read-only local requests; they contain no app password/hash. This identity is **not authentication against a malicious local process** and grants no process-killing/control authority.

Both browsers intercepted seven intended official-range requests before reaching the live service; both report the following privacy diagnostics:

```json
{
  "observedRequestCount": 7,
  "fiveHexPrefixOnly": true,
  "getOnly": true,
  "requestBodiesAbsent": true,
  "plaintextTransmitted": false,
  "completeHashTransmitted": false,
  "paddingRequested": true,
  "referrerCookieOrAuthorizationObserved": false
}
```

The local Web Crypto SHA-1 is protocol compatibility only. Only its first five uppercase hex characters enter the official HTTPS range URL; the 35-character suffix is compared locally. No plaintext/full digest/suffix is sent. Failed/incomplete/malformed results never become a negative. Real service users still disclose prefix/IP/network metadata, so this is not anonymity or secure memory erasure.

All breach responses in tests were **mocked**. No real credential, account or live HIBP query was used. OS clipboard/download history, extensions, compromised hosts and browser memory are outside the app's control.

## Commands actually executed

```sh
npm test                      # baseline 77, then complete final 99
npm run test:local             # final 38
npm ci --no-audit --no-fund    # restore only existing pinned dev tools
npx playwright install chromium firefox
# Only missing browser-test OS libraries were installed in the sandbox:
sudo apt-get install -y --no-install-recommends libxdamage1 libgtk-3-0t64 libatk1.0-0t64 libasound2t64
sudo apt-get install -y --no-install-recommends libnspr4 libnss3
HOST=0.0.0.0 PORT=3000 npm run dev -- --no-open
bash ./start-passguard.sh --no-open
bash ./start-passguard.sh      # real headless skip and reuse verified
npm start                    # reused the same verified listener
npm run dev                  # reused the same verified listener
npm run test:browser
npm run test:firefox
bash -n start-passguard.sh
for f in js/*.js tests/*.js tests/*.mjs scripts/*.mjs; do node --check "$f"; done
npm audit --json
npm audit --omit=dev --audit-level=moderate
```

Node **20.20.2**, npm **10.8.2**, Playwright **1.64.1**, axe integration **4.13.0**, Chromium **156.0.8078.4**, Firefox **157.0** were used on Linux. Browser binaries/OS test libraries and npm dev tools are optional verification prerequisites, **not local app startup dependencies**, and are not included in the source bundle. No npm package or lockfile version was added/changed.

An early Chromium run could not launch because this fresh sandbox lacked NSPR/NSS libraries. Missing libraries were installed before the final full run passed; that unavailable launch was not recorded as a pass. A late robustness review added the disabled-IPv6 mapping regression; all 99 native cases and both full browser suites were rerun afterward. No test or application feature was dropped to manufacture success.

## Exact local lifecycle

After backing up/applying the focused update as described in [local setup](localhost-setup.md):

```sh
cd ~/Downloads/passguard
chmod +x start-passguard.sh
./start-passguard.sh
```

Open **http://localhost:3000**. Stop with **Ctrl+C in the owning terminal**, wait for `PassGuard stopped.`, then rerun the script to restart. `npm start` / `npm run dev` use the same idempotent server; `npm run start:open` requests a desktop browser. A duplicate/reused invocation exits and does not own the old server. Windows uses `start-passguard.bat`, with native Windows testing still manual.

Optional login auto-start is documented with explicit install/start/stop/restart/disable/remove commands in [the user-service guide](localhost-setup.md#optional-linux-auto-start-on-login). The template was **not enabled** here or on Kali. No cloud account, Arena session or agent is needed to run any local launcher.

## Deliverables and packaging

Complete source: **57 files**, excluding node_modules/caches/temporary fixtures. Focused `passguard-local-startup-update.zip`: **22 new/changed files**, no index/CSS/browser-JS/assets. Complete `passguard.zip`: full current source. The older localhost-only update is superseded by this independent-startup update.

Packaging verification was **actually executed**: full ZIP **57 entries**, focused overlay **22 entries**, CRC and every archived body matched the workspace; **40 relative documentation links/anchors** resolved. The executable Linux mode is stored in both archives. Real `unzip` applied the focused update over the inspected 52-file source bundle, reproduced all 57 current files byte-for-byte, and ran **99/99 native tests without node_modules or npm install** from a path containing spaces. Its executable shell launcher independently reused the verified port-3000 server without Arena tools. Both ZIPs were rebuilt after this documentation update, then final full-source extraction and overlay checks repeated: **99/99 native tests passed in each**, executable shell reuse succeeded, and temporary test copies were cleaned. Browser/test caches and installed packages are not bundled.

## Complete source inventory

```text
passguard/
  .gitignore
  README.md
  assets/favicon.svg
  css/print.css
  css/responsive.css
  css/style.css
  docs/architecture.md
  docs/browser-test-results.json
  docs/dependency-audit.json
  docs/firefox-test-results.json
  docs/localhost-http-results.json
  docs/localhost-setup.md
  docs/manual-testing.md
  docs/screenshots/mobile-firefox.png
  docs/screenshots/mobile.png
  docs/screenshots/overview-firefox.png
  docs/screenshots/overview.png
  docs/security-audit.md
  docs/systemd/passguard.service.example
  docs/test-results.md
  docs/unit-test-results.txt
  index.html
  js/analyzer.js
  js/app.js
  js/attack-estimator.js
  js/breach-checker.js
  js/character-analysis.js
  js/clipboard.js
  js/common-password-checker.js
  js/crack-time-estimator.js
  js/entropy-calculator.js
  js/formatters.js
  js/password-generator.js
  js/password-validation.js
  js/recommendations.js
  js/report-export.js
  js/risk-indicators.js
  js/security-report.js
  js/state.js
  js/strength-score.js
  js/ui.js
  js/weakness-detector.js
  package-lock.json
  package.json
  scripts/dev-server.mjs
  scripts/local-startup.mjs
  start-passguard.bat
  start-passguard.sh
  tests/analysis.test.js
  tests/attack.test.js
  tests/breach.test.js
  tests/browser-smoke.mjs
  tests/dev-server.test.js
  tests/generator.test.js
  tests/local-startup.test.js
  tests/report-state.test.js
  tests/security-structure.test.js
```

## Evidence and manual boundaries

- [Native TAP](unit-test-results.txt), [Chromium JSON](browser-test-results.json), [Firefox JSON](firefox-test-results.json), [HTTP/source/reuse evidence](localhost-http-results.json), [audit JSON](dependency-audit.json).
- [Independent local setup and auto-start](localhost-setup.md), [architecture](architecture.md), [security review](security-audit.md), [manual checklist](manual-testing.md).
- Cleared screenshots: [Chromium desktop](screenshots/overview.png), [Chromium mobile](screenshots/mobile.png), [Firefox desktop](screenshots/overview-firefox.png), [Firefox mobile](screenshots/mobile-firefox.png).

Not verified: user's actual Kali files/profile/Firefox ESR, native Windows OS, real graphical default-browser/clipboard permission/print dialogs, Firefox Save as PDF, an actual systemd user-login cycle, live service reachability/CORS/current dataset counts, Safari/physical mobile devices/screen readers, independent security/cryptographic review or score calibration. These limits are explicit, not hidden test passes. No project source was published or uploaded to a remote repository.
