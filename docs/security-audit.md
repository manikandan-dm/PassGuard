# PassGuard security self-review

**Review date:** 17 October 2026 (independent local-startup update; application review preserved)  
**Scope:** application source, state transitions, request/response boundary, generator, report/export paths, dependency inventory, automated synthetic tests, the Node static development transport, and Chromium/Firefox UI behavior (browser-specific capabilities are disclosed).  
**Not a certification:** this is an engineering self-review, not an independent penetration test, formal proof, cryptographic assessment, or production-readiness guarantee.

Recorded commands and actual results are in [test-results.md](test-results.md). All breach test responses are mocked. No real password or account was tested; no repository or project files were published remotely.

## Threat model

Protect against accidental application collection/persistence, plaintext or full-hash transmission, weak randomness fallbacks, obvious HTML injection, mislabeled failed breach checks, stale displayed results, and late async updates after reset/input changes.

Do not claim protection from a malicious host modifying the source, compromised browser/OS, extensions, keyloggers, clipboard history/sync, screenshots, shoulder surfing, service-side metadata observation, unknown guessing patterns, or memory forensics.

## Review checklist and evidence

| Area                        | Safeguard / evidence                                                                                                                                                                                                                                  | Residual limit                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent browser storage  | No runtime localStorage, sessionStorage, IndexedDB, or application cookie code. Source tests enforce this; browser tests confirm empty storage/cookies after interaction.                                                                             | A browser/extension/OS may retain traces outside app control.                                                                                         |
| Plaintext transmission      | Only `breach-checker.js` has a runtime request operation. It builds a fixed official HTTPS range URL using five hash characters. No request body, form submit, query credential, or analytics.                                                        | Static file delivery and optional documentation links are ordinary networking. The trusted host/source matters.                                       |
| Complete hash transmission  | SHA-1 is locally split; only `slice(0, 5)` enters the URL. Request inspections assert absence of plaintext/full digest. State/report results omit prefix, suffix, and full hash.                                                                      | SHA-1 material exists temporarily inside a local call frame. The protocol reveals a prefix, not zero information.                                     |
| Logging                     | Browser runtime modules contain no console logging. The static launcher prints only startup/shutdown/configuration messages, never requests, body data, passwords, or hashes. Error messages are static and omit input/hash/fragments.                                                                                                                                                  | DevTools, malicious extensions, or debugger access can inspect memory. Synthetic test assertions are not production logging.                          |
| Randomness                  | `getRandomValues()` only; unbiased rejection sampling; secure Fisher–Yates shuffle; selected-category guarantees; fail closed if crypto unavailable. Native tests cover the biased tail and every category subset.                                    | Not a uniform sampler over all category-constrained strings. No entropy guarantee beyond the documented construction.                                 |
| Input validation            | Shared string/nonempty/control-character/1,024 UTF-16-unit boundary; generator integer 8–64 and boolean categories; four finite rate bounds. Numeric mutations are all-or-nothing.                                                                    | This is not a general-purpose password validator for a service's rules. Unicode pool/length assumptions are simplified.                               |
| HTML injection              | Secret values go only to input/textarea `value`. Dynamic result/report strings are escaped. Tests inject HTML-looking passwords and report fields. No inline handlers, remote scripts, or eval.                                                       | Template rendering uses `innerHTML` for internally constructed, escaped markup; future changes must retain this trust boundary.                       |
| CSP                         | App uses local scripts/styles and an allowlisted connect origin. Object embedding, form action, and base URI are restricted. Downloaded HTML has no scripts and a stricter CSP.                                                                       | Meta CSP is defense in depth, not tamper-proof source delivery or a complete production header policy.                                                |
| Exposure result correctness | Exactly HTTP 200 required; expected content type when available; accepted body size/row syntax/count/duplicate validation; entire body checked before returning; padding zero ignored. Errors, 429/404/5xx, timeout and malformed bodies fail closed. | Live API reachability/CORS and future response changes need manual verification. The accepted-size check is not a general network streaming firewall. |
| Cancellation/staleness      | Monotonic assessment revision, abort controller, raced timeout/cancel promise, and current-result guards. Edit/reset/re-analysis/cancel cannot accept old responses.                                                                                  | Cancel cannot retract a prefix request already received by the service.                                                                               |
| Clipboard                   | Success only after write promise resolves; permission/unsupported fallback selects text for manual copy. Monotonic generator revision prevents old callbacks reviving UI after reset/new generation.                                                  | A pending write may still affect the external clipboard. Reset cannot erase clipboard history or sync.                                                |
| Report privacy              | Reports accept non-secret records, not password/hash arguments. HTML/text/preview tests assert synthetic credential/digest absence. Dynamic HTML escaping includes table cells, titles, bullets, and rows.                                            | Length/category/weakness information remains sensitive metadata. Downloaded copies are not deletable by Reset.                                        |
| Print                       | Print CSS isolates the current generated report and hides password fields, navigation, and controls. Both browser tests exercise mocked print invocation and real print-media styles; Chromium additionally renders an actual headless PDF. Firefox native PDF remains manual.                                                                       | Human-operated system dialogs, printers, and PDF destinations differ by browser/OS and require manual checks.                                         |
| Dependencies / secrets      | Zero runtime npm packages, API keys, backend credentials, CDNs, or external fonts. Optional test-only tools are pinned by lockfile. npm audit is recorded separately.                                                                                 | An audit only reflects known advisories at run time; test tools and the environment still require updates.                                            |
| Lifecycle clearing          | Reset masks inputs, clears raw/generated values, analysis/exposure/report/copy feedback. Pagehide/pageshow BFCache handlers perform best-effort clearing.                                                                                             | Garbage collection is browser-controlled. Crashes may bypass lifecycle events; secure memory zeroing is not guaranteed.                               |

## Localhost transport review

The existing application HTML, all three stylesheets, all twenty browser modules, and the favicon were preserved for the localhost task. A Node built-in static transport replaces the Python-dependent npm launcher; there is still no application backend or credential-processing endpoint.

Default loopback binding limits ordinary local use to this machine. The fixed default port is 3000; there is no automatic alternate port. Verified PassGuard instances are reused, while foreign/unverified listeners cause exit 73 and are never killed. Hosted previews require an explicit all-interface HOST override and are not equivalent to a private loopback setup. The server accepts preview Host headers so it works behind the Arena proxy; it does not enable permissive cross-origin response headers or introduce frontend localhost API requests.

The static handler allows only the existing public index/CSS/JS/assets plus a fixed read-only identity record, returns correct MIME and no-store/nosniff/no-referrer headers, and denies private files, directory listing, traversal, malformed encoded paths, and symlink escape/private-target access. GET/HEAD are supported; unsupported bodies are discarded without parsing, echoing, or logging. Native HTTP tests exercise these boundaries using only synthetic requests and temporary fixtures. These are defense-in-depth checks, not a claim against an adversary who can alter the local source/filesystem or a recommendation to expose this development server publicly.

No password entry is sent to the local transport by the frontend. Analysis/generation/state/report operations stay in browser memory. The optional explicit exposure check retains the existing prefix-only official HTTPS request. The launcher has no upload/analysis API, persistence, secrets, or request/access logs; console diagnostics from deliberate network-failure/HTTP 429 mocks are identified in test evidence, not reclassified as successful exposure checks.

### Startup identity and ownership limits

The identity record exposes only application/service/protocol constants: no PID, project root, token, user data, or password/hash. Startup probes use only validated local addresses, bounded response/time limits, no cookies or redirect following. Legacy compatibility compares exact local homepage bytes, not a title. Both loopback address families are checked, and a disabled IPv6 stack is handled without falsely blocking normal IPv4 startup. Identity is duplicate prevention, **not authentication against a malicious local process**.

No shutdown endpoint, broad process killer, stale PID file, daemon privilege, or automatic service installation was added. The owning foreground terminal handles Ctrl+C; a reused invocation exits without ownership. The optional user-service template refuses to adopt another owner and prevents repeated conflict restarts. It was not enabled or tested through an actual user-login cycle. Native Windows behavior remains untested; platform command/wrapper checks on Linux do not substitute for that.

Browser opening is optional and restricted to local application URLs; native helpers receive argument arrays rather than an evaluated command/BROWSER variable. Headless/CI/open-helper failures do not block the server. No real GUI tab opening is inferred from a successful helper spawn. Existing browser analysis/generator/breach/report modules remain byte-identical, and no credential API or runtime npm dependency was introduced.

## Confirmed issues fixed during implementation

1. **Primary button contrast.** White text on the initial lighter blue did not meet the automated 4.5:1 threshold for small text. The primary blue and hover colors were darkened; scans rerun.
2. **Light-theme secondary text contrast.** Metadata on the pale page background was below 4.5:1. The secondary color was darkened; scans rerun.
3. **320px recommendations overflow.** The heading and action had an excessive combined minimum width. Mobile headings now wrap and no longer overflow in the tested view/width matrix.
4. **Clipboard revision collision found in code review.** A generator revision reset to zero could collide after reset plus regeneration. The token now remains monotonic across reset, with a dedicated state regression and browser async regression.
5. **Changed attack-rate descriptions.** Initial descriptions repeated hardcoded example rates even after users applied alternatives. Descriptions now express qualitative assumptions; the applied numeric rate is shown separately.
6. **Pending report availability.** Dashboard/report status explicitly waits for an active breach check, rather than implying generation is currently available.
7. **Familiar published passphrase.** A small explicit familiar-phrase warning prevents well-known demonstration phrases from gaining a high score merely from length. This is not a comprehensive quote detector.

8. **Skip-link routing/focus regression found during final re-verification.** Activating the main-content skip link from Generator navigated to Overview because the hash router treated the focus target as a section. The link now prevents route navigation and focuses the main region. A keyboard regression verifies all ten sections; all sixteen delegated button actions and the mobile Close/backdrop/Tab/Escape controls are also checked. The existing analysis, generator, breach, and report implementations were preserved.

Test development also corrected inaccurate expected fixture counts and an assumed report-section count; those were test expectation errors, not hidden test passes. Early Chromium startup lacked system libraries; browser prerequisites were installed before browser tests were executed successfully. Final results, not intermediate failures, are recorded with runnable commands.

## Remaining limitations / human checks

- The score is not calibrated against an attacker or independently audited. Pattern coverage is deliberately small and English-centric, with possible false positives/negatives.
- Entropy and time estimates assume independent uniform choices. They can hugely overstate resistance to prioritized guessing.
- Service availability and live CORS/response behavior were not tested using real requests; all exposure tests use synthetic fixtures and mocks.
- Headless Chromium/Firefox automation is not certification of the user's Kali Firefox ESR/profile, Safari, iOS, Android, or screen readers. Firefox clipboard success is a mocked API boundary; actual permission prompts and native print/PDF remain manual.
- Embedded/sandboxed previews may restrict clipboard, downloads, or printing. Use a normal localhost/HTTPS tab to verify native permissions and dialogs.
- A malicious source/host can defeat client-only protections. Production use would need independent security review, HTTPS/header configuration, wider testing, and a more robust guess-rank model.
- No actual password vault, storage hashing, authentication service, account lookup, or password-cracking functionality is provided or implied.

## Safe extension rules

1. Keep `analyzer.js` and `strength-score.js` authoritative; do not add a competing dashboard or generator score.
2. Never add telemetry, automatic breach calls, credential URLs, or persistent password/hash caches.
3. Never interpolate raw input into HTML, even if it came from the generator.
4. Treat any error or incomplete response as unavailable—not unexposed.
5. Preserve revision/abort guards and report invalidation when adding asynchronous actions.
6. Keep dependencies development-only unless a genuine documented requirement emerges.
7. Run native and browser suites plus manual privacy tests after any change.
