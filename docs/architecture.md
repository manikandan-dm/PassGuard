# PassGuard architecture

## 1. Design and deployment

PassGuard is a single static HTML document containing ten semantic view sections. CSS handles themes, responsive layouts, and print isolation. JavaScript ES modules provide local computation and event-driven rendering. There is no framework, bundler, application server, database, authentication layer, or runtime package dependency.

A static HTTP server is necessary for module loading and a trustworthy browser origin. `scripts/dev-server.mjs` is a dependency-free Node development transport, not an application backend. Both `npm run dev` and `npm start` use it. It resolves the project root from its own file location, binds to 127.0.0.1:3000 by default, and prints a URL only after a successful bind or a verified existing PassGuard response. There is no automatic alternate port: another application on the chosen port causes exit 73. Explicit PORT/`--port` deliberately selects another single port. HOST/`--host` controls the bind address; Arena previews explicitly use 0.0.0.0. Only index/CSS/JS/assets plus a fixed read-only `/__passguard/health` identity record are served, using correct MIME, no-store/nosniff/no-referrer headers, GET/HEAD, public-path/traversal/symlink checks, and no directory listing or access/request logs. Request bodies are discarded, never parsed or echoed. Ctrl+C/SIGTERM closes the listener. This is a local development transport, not a hardened public production server. The application never submits forms, credentials, or analysis records to it. All assets, fonts (system fonts), and icons (inline SVG) are local. Production deployment, if explicitly chosen later, should use a trusted HTTPS static host and matching HTTP security headers.

### Independent local startup layer

`start-passguard.sh` (Linux) and `start-passguard.bat` (Windows) invoke the same Node launcher from their own project directory, forcing safe loopback/3000 defaults before explicit user flags. Neither calls Arena, installs packages, requires npm, nor requires browser automation. They remain foreground processes; Ctrl+C stops the owning instance.

`scripts/local-startup.mjs` probes only validated loopback addresses with bounded HTTP/time limits and no redirect following. It recognizes a fixed application/service/protocol record or an exact legacy homepage-byte match, not a page title. Both address families are checked; unsupported IPv6 does not falsely block IPv4, while unverified/timeout/reset/permission failures remain conflicts. A bind race is re-probed so simultaneous starts converge to one owner. A second launch reuses the original listener and exits; it does not own or kill it. This is convenience identity, not authentication.

Optional `--open` uses native OS URL handlers with argument arrays, never an evaluated shell/BROWSER string; headless/CI and opener failures do not become server dependencies. The OS wrappers default to requesting a browser; npm defaults to no browser request, with `start:open` available. The optional user-service template uses `--require-new --no-open`, so a supervisor does not pretend to own a terminal's server; exit 73 prevents conflict restart loops. The template is not installed or enabled automatically.

The low-level exported transport still accepts an explicit multi-port list for existing tests/integration callers, but the public CLI and OS launchers select one fixed port. None of this local control code is shipped to browser modules, and there is no credential-processing or shutdown API.

## 2. Responsibility map

| Module                       | Responsibility                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.js`                     | Wires controls to store transitions; aborts asynchronous work; calls clipboard/download/print APIs; lifecycle clearing.                                   |
| `ui.js`                      | Renders non-secret records, mirrors input values, manages sections/theme/mobile navigation, and exposes accessible status messages. No score computation. |
| `state.js`                   | The only shared memory store. Separates current and outdated analysis; holds exposure/report state; monotonic async revision tokens.                      |
| `password-validation.js`     | Shared type, nonempty, length, and control-character validation; static non-sensitive error messages.                                                     |
| `analyzer.js`                | The single analysis orchestration entry point for both manually entered and generated passwords.                                                          |
| `character-analysis.js`      | Unicode code-point length; ASCII categories; special/space/Unicode statistics without returning character values.                                         |
| `weakness-detector.js`       | Static structured pattern warnings, penalties, and caps; no password fragments in output.                                                                 |
| `strength-score.js`          | The only score/classification implementation.                                                                                                             |
| `entropy-calculator.js`      | Theoretical entropy and explicit pool/Unicode assumptions. Independent of scoring.                                                                        |
| `recommendations.js`         | Deduplicated context-aware advice from length and detected weaknesses; universal uniqueness, manager, and MFA steps.                                      |
| `common-password-checker.js` | Hand-curated 50-entry list and demonstration dictionary; exact-list lookup separate from pattern warnings.                                                |
| `attack-estimator.js`        | Search-space logarithms and four editable hypothetical scenarios; calls the duration and risk modules.                                                    |
| `crack-time-estimator.js`    | Rate validation and overflow-safe scientific/time formatting.                                                                                             |
| `risk-indicators.js`         | Reuses the analysis classification and weakness codes. No second score.                                                                                   |
| `password-generator.js`      | Web Crypto, rejection sampling, selected-category seeding, pool fill, and secure Fisher–Yates shuffle.                                                    |
| `clipboard.js`               | Promise-based copy boundary; static actionable failure messages.                                                                                          |
| `breach-checker.js`          | Explicit SHA-1/prefix range protocol, validation, cancellation, timeout, and safe error states. No UI dependency.                                         |
| `security-report.js`         | Non-secret report data and fully escaped preview HTML. Exposure-state labels are centralized here.                                                        |
| `report-export.js`           | Self-contained HTML/text serialization, local Blob downloads, and native print invocation.                                                                |
| `formatters.js`              | Escaping, date formatting, and exact large decimal occurrence-count display.                                                                              |

No required module is an empty placeholder. Additional modules isolate shared validation and async/security boundaries for direct native tests.

## 3. Shared data flow

```text
Manual input ───────────────────┐
                               ▼
Generator ── explicit Analyze → memory-only password
                               │
                        explicit Analyze
                               ▼
                         analyzer.js
              ┌────────────────┼─────────────────┐
              ▼                ▼                 ▼
         characters        weaknesses       local list
              │                │                 │
              ├─ entropy       ├─ one score       │
              │                └─ recommendations│
              └────────────────┬─────────────────┘
                               ▼
                   non-secret analysis record
                      │        │          │
                      ▼        ▼          ▼
                  dashboard  estimator  recommendations
                               │
          explicit Breach check│    explicit Generate report
                    │          │                │
                    ▼          └────────────────┤
                exposure record ────────────────┤
                                               ▼
                                       report snapshot
                                       │      │      │
                                     preview HTML   text / print
```

The returned analysis contains date/time, score/classification, character statistics, entropy assumptions, static weakness explanations, recommendations, and local check results. It contains **no password, normalized password, matched fragment, full hash, prefix, or suffix**.

The raw input exists only in the store, temporary call frames, and controlled input/textarea `value` properties. Both password fields mirror the same canonical input. There are no URL or persistence adapters. Generated output is independent until explicitly analyzed.

## 4. Current-result state machine

Core fields:

```text
password          current raw input, memory only
analysis          most recent non-secret analysis, or null
stale             whether that analysis predates an input edit
revision          monotonic async assessment/breach token
generated         generator output, memory only
generationRevision monotonic async clipboard token
breach            not-checked | checking | exposed | not-found | error
report            current non-secret snapshot, or null
rates             last applied hypothetical assumptions
```

- Initial state: empty input, no analysis, no report, exposure `not-checked`.
- Input edit: cancel network work, increment revision, mark old analysis stale, reset exposure, clear report. `currentAnalysis()` and `currentAttack()` return null for stale analysis.
- New explicit analysis: use the current input, replace analysis, increment revision, reset exposure/report.
- Start breach: require current analysis, increment revision, clear report, set `checking`.
- Finish breach: accept a completed result only if its revision still matches, analysis is current, and exposure remains `checking`.
- Cancel/reset/re-analysis/input edit: invalidate the token even if an underlying promise resolves late.
- Apply rates: validate all four before any mutation. Invalidate a report, but preserve the analysis score and exposure result.
- Re-run local check: require a current analysis; recompute the local result without a network request; invalidate the report.
- Report generation: require current analysis; reject while a breach check is pending. Unchecked/failed exposure states are valid report inputs and remain honestly labeled.
- Reset: remove raw input, generator output, assessment, exposure, and report; hide passwords; remove sensitive rendered results. Theme/category settings and rate preferences need not reset.

`generationRevision` also increases across reset. An old clipboard promise cannot revive a success/error message for a newly generated value. It cannot undo a system clipboard write; that boundary is explicitly disclosed.

## 5. Numerical and scoring model

Exactly one scoring function combines length, modest category credit, and structured penalties/caps. Weak/Medium/Strong thresholds are shared everywhere. Exposure is orthogonal; it does not secretly alter the score.

Entropy is separate and theoretical. ASCII character pools are explicit; Unicode uses observed distinct non-ASCII code points as a conservative proxy. Neither a high entropy number nor a large search space establishes human unpredictability.

Attack calculations use base-10 logarithms throughout. Rendering exponentiates only small bounded mantissas or values within readable time units. Thus an input whose theoretical pool exceeds floating-point range still yields a finite log and readable scientific notation. Expected exhaustive attempts `N/2` and total candidates `N` remain distinct. No real guessing occurs.

## 6. Generator design

1. Validate integer length 8–64 and boolean selected categories.
2. Require browser `crypto.getRandomValues`; fail closed if unavailable.
3. Obtain unbiased integer indices by rejecting the unused tail of the 32-bit sample space before modulo reduction.
4. Seed one independently selected character from each chosen category.
5. Fill remaining positions from the combined selected pool.
6. Shuffle all positions using the same secure integer function.
7. Display only in a controlled textarea `value`. No automatic copy, persistence, requests, or perfect-score label.

Category guarantees mean the algorithm is not a uniform sampler over all valid category-constrained strings. This is disclosed; pool-based entropy remains an educational theoretical quantity.

## 7. Breach process and request boundary

Only the explicit UI action calls `checkBreach()`. No input/blur/navigation listener calls the service.

```text
exact password → UTF-8 → local SHA-1 → uppercase 40-hex digest
                                      │
                      first 5 hex only│GET /range/{PREFIX}
                                      ▼
                         official HTTPS service
                                      │ padded suffix:count list
                                      ▼
             validate every row → compare 35-hex suffix locally
                                      ▼
                    { status, count, checkedAt } only
```

The request sets padding, omitted credentials/referrer, no cache, and redirect rejection. A 10-second abort timer and a raced cancellation promise cover hashing, fetch, and body read. The implementation verifies exact HTTP success, expected content type when present, a bounded accepted response size, suffix length/hex format, decimal counts, and duplicate rows. Malformed data is rejected even if a valid match occurred earlier in the body. Padding count zero is never an exposure.

Error categories include unsupported browser APIs, hashing failure, network/CORS failure, rate limits, unexpected HTTP status, malformed data, cancellation, and timeout. A failure never becomes `not-found`. Returned records omit all digest material. SHA-1 is protocol compatibility only.

The external service can still observe the prefix and IP/network metadata. Padding and k-anonymity reduce information disclosure; they do not provide absolute anonymity.

## 8. Reports and HTML trust boundary

`generateSecurityReport()` accepts an analysis, exposure status, and applied attack estimates—not raw credentials. A snapshot consists of titled sections, label/value rows, bullet records, and a scenario table. It accurately distinguishes **Not checked**, **Not available**, **Check failed**, and a successful **No match found in the checked dataset**.

The renderer escapes every dynamic string, including table cells and injected test fields. In-app templates use only escaped text and trusted numeric values/enumerated classes; secret values are never interpolated into HTML. Original inline SVG icons are constant markup.

Downloads use local Blob URLs and temporary anchors, with delayed object-URL revocation. Exported HTML has inline CSS, no scripts or external assets, and a restrictive CSP. Plain text uses the same report sections. Printing hides all application views/controls and exposes only a generated current report; absent a report, print CSS displays an explanatory message.

Downloaded reports reveal password characteristics even though credentials are absent. They are outside the app's automatic clearing boundary.

## 9. Privacy boundaries and threat model

**Protected against:** accidental credential collection/persistence by this application, plaintext/full-hash transmission, automatic exposure lookups, false-negative errors, obvious HTML injection, insecure generation fallback, stale-result presentation, and late async results overwriting new assessments.

**Not protected against:** a modified/untrusted host or source bundle, malware, malicious extensions, compromised browser/OS, shoulder surfing, clipboard history/sync, screenshots, phishing beyond educational advice, unknown dictionary patterns, memory forensics, or service-side network metadata visibility.

CSP is defense in depth, not a claim that a malicious host cannot change its own scripts. JavaScript cannot guarantee secure memory zeroing. Lifecycle clearing is best-effort and may not run after a process crash. A production security product would require independent review and a wider threat model.

## 10. Verification approach

Native Node tests require no packages and cover pure functions, state transitions, error paths, report safety, source/link integrity, and the actual static HTTP/CLI transport including root resolution, MIME, explicit transport fallback, path/privacy boundaries, and shutdown. New startup tests cover identity/legacy matching, foreign/silent/oversized/redirected listeners, IPv6 conflict/absence, duplicate/race convergence, supervisor ownership, real Linux path/cwd/stop/restart behavior, and mocked OS-opener command/failure paths. Optional Playwright tests use actual Chromium or Firefox controls, intercept all exposure requests with synthetic responses, and block unexpected external traffic. Firefox uses an explicitly mocked successful clipboard boundary and real download/style checks; actual Firefox clipboard prompts and native print/PDF remain manual. Chromium additionally verifies real clipboard writing and headless PDF output. Expected diagnostics from intentionally aborted/HTTP 429 mocks are classified separately; other console errors fail. Results and cleared screenshots are browser-specific, so Firefox does not overwrite Chromium evidence. Axe-core scans evaluate the populated views in both themes and selected empty/mobile states. Six widths cover all ten sections; tables scroll inside their own wrappers rather than overflowing the page.

See [test results](test-results.md), [security audit](security-audit.md), and [manual testing](manual-testing.md). Browser dependencies and screenshots are testing/documentation assets, never production JavaScript dependencies.
