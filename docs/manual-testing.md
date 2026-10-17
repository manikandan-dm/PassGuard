# PassGuard manual test checklist

Use **synthetic fixtures only**. Public examples below must never become real passwords. Expected labels refer to the documented educational heuristic—not objective security certification.

The recorded automated runs are in [test results](test-results.md). This document is a reproducible checklist; it does not imply every device, browser, or human-operated dialog has been manually tested.

## Preparation

1. On Kali, run `cd ~/Downloads/passguard`, `chmod +x start-passguard.sh`, then `./start-passguard.sh` with Node 20+. No npm install or Arena process is required. Npm start/dev are equivalent server alternatives.
2. Open **http://localhost:3000** in Firefox if the optional OS browser request did not open a tab. Reuse of an existing PassGuard server must not launch another listener; another app on 3000 must fail clearly with exit 73.
3. Open Developer Tools → Console, Network, and Application/Storage panels.
4. Clear preexisting storage for this local origin if other projects previously used it.
5. Keep network recording on. Filter external requests separately from the necessary local HTML/CSS/module/favicon requests.

Recommended desktop browsers: current Chrome/Edge, Firefox, and Safari. Repeat mobile tests on an actual Android and iOS device where possible. LAN HTTP is not a secure context; use a trusted HTTPS preview or local device hosting if testing clipboard/Web Crypto.

### Localhost startup checks

- Check `node --version` and `npm --version`; use Node 20+ and run the commands as your ordinary user.
- Start the same launcher twice: the second must identify and reuse PassGuard without starting another server. With a known different test application on 3000, startup must fail with exit 73, leave the other application intact, and not silently move to 8000. Do not kill unknown processes.
- `npm run dev -- --port 8000` selects only that port; an occupied explicit port must fail rather than silently move.
- In Network, index/CSS/JS/favicon requests must succeed with appropriate MIME; no build or CDN is involved. Unknown assets must be 404, not an HTML fallback. Source/config/docs/test files and directory listings are intentionally unavailable over this dev server.
- Press Ctrl+C in the owning terminal, confirm the listener closes, then restart using the shell launcher and npm aliases. Closing a browser tab is not a server stop. An invocation that reused a server does not own it.
- Try `--no-open` and a headless session: server operation must not require any browser helper. In a real GUI, verify the OS default URL handler; native Windows behavior remains manual.
- Optional: review the user-service template, start/stop/restart it only if desired, and disable it again. The template is not automatically installed or enabled; verify the actual login cycle on your own machine.
- Read [localhost setup](localhost-setup.md) for applying the overlay and troubleshooting before changing application code.

## A. First load and navigation

1. Load the app with a fresh page session.
   - **Expected:** dark navy Overview, no score or fabricated example numbers, strength **Not analyzed**, local check not checked, exposure **Not checked**, report unavailable, generator readiness based on Web Crypto support.
2. Open every sidebar item: Overview, Analyzer, Generator, Attack resistance, Common passwords, Breach exposure, Recommendations, Security report, Security essentials, Privacy & limitations.
   - **Expected:** exactly the correct section becomes visible; active item, breadcrumb, page title, and keyboard heading focus change. No placeholder pages.
3. Use browser Back/Forward and direct section URLs such as `/#generator`.
   - **Expected:** the right section and active navigation are restored. Unknown hashes fall back to Overview without injecting markup.
4. Toggle light/dark theme twice.
   - **Expected:** readable colors, controls, and active states in both themes; no network request or storage write. A reload returns to default dark theme.
5. Navigate only with Tab, Shift+Tab, Enter, and Space.
   - **Expected:** visible focus, descriptive button/input labels, and no keyboard traps on desktop. Activate Skip to main content from a non-Overview section: focus must move to the main region without changing the current section, hash, or assessment.

## B. Password analyzer and shared results

1. Leave input empty and select Analyze.
   - **Expected:** an actionable **Enter a password first** message. No fabricated assessment or network request.
2. Enter `password`, select Show, then Hide.
   - **Expected:** the field changes between text/password, button name and pressed state update. Neither action makes an API request.
3. Analyze `password`.
   - **Expected:** Weak, bounded 0–100 score, length 8, lowercase 8, no other ASCII categories. Dictionary/local-list weaknesses and contextual advice appear. Common password page says **Exact match in the local list**.
4. Analyze `vR8#kL2!xT`.
   - **Expected:** Medium under the current documented rule. No API request.
5. Analyze `vR8#kL2!xT9@pN6$`.
   - **Expected:** Strong under the heuristic, length 16, uppercase 4, lowercase 4, digits 4, special 4, pool 94. A Strong result still includes limitations.
6. Compare Overview, Analyzer, Common passwords, Recommendations, Attack resistance, and a generated report.
   - **Expected:** the same score/classification and statistics everywhere; no conflicting scoring systems. Local-list absence is **Not found in the local list**, not “safe.”
7. Analyze these public pattern fixtures one at a time:
   - `P@ssw0rd` → predictable substitutions.
   - `Password2026!` → dictionary-like base, simple additions, year pattern; not Strong.
   - `abcdef123456` → sequential patterns.
   - `qwertyuiop` → keyboard sequence.
   - `AAAAAAAAAAAA` → repeated character/one distinct character.
   - `ab!ab!ab!` → repeated sections.
   - `orange-orange` → repeated words.
   - `correct-horse-battery-staple` → familiar published phrase, not Strong.
   - **Expected:** static explanatory weakness messages and relevant recommendations; no password fragments printed in results or logs.
8. Analyze `ABcd12!? `, keeping the trailing space.
   - **Expected:** length 9, 2 uppercase, 2 lowercase, 2 digits, 3 special/other. Pool includes a space. No trimming.
9. Analyze `Ab1!😀😀é`.
   - **Expected:** code-point length 7, 3 non-ASCII code points, 2 distinct non-ASCII code points, explicit Unicode pool-proxy note. This is not a grapheme-count claim.
10. Try pasting an over-limit value or programmatically setting invalid/control-character text in a test session.
    - **Expected:** input cap/validation, actionable errors, no sensitive error detail or freeze.

## C. Outdated results and reset

1. Analyze a fixture and generate a report.
2. Edit one character without analyzing again.
   - **Expected:** an outdated-results notice appears immediately; current score/estimates and personalized results are hidden, exposure is not checked, report exports are disabled.
3. Restore the original exact text without analyzing.
   - **Expected:** still outdated. An explicit new analysis is required.
4. Re-analyze, show the password, generate a password, and create a report. Select Reset / Clear workspace.
   - **Expected:** both password inputs, generated output, assessment, breach status, report preview, copy feedback, and sensitive results clear. Password fields are masked again. Theme/settings/rate preferences may remain.
5. Inspect localStorage, sessionStorage, cookies, and IndexedDB.
   - **Expected:** PassGuard creates no persistent password/hash/report records. The source has no application persistence adapter.
6. Reload or leave and return using browser history.
   - **Expected:** no persisted credentials or assessment; lifecycle clearing also handles browser back/forward cache where events run.

## D. Generator and clipboard

1. Open Generator and select all four categories, length 20. Generate several candidates.
   - **Expected:** exactly 20 characters, at least one from every selected category; output varies. No automatic copying, perfect-score claim, storage, or external request.
2. Set lengths 8 and 64, using both the range and number control.
   - **Expected:** controls synchronize and valid output lengths match. Changing settings clears the older output.
3. Select only digits, generate length 32.
   - **Expected:** only digits, exactly 32. Analyze uses the same engine and can flag patterns—it is not automatically labeled perfect.
4. Disable every category and generate. Also try number input 7, 65, or a fractional length.
   - **Expected:** clear errors, no insecure fallback, no old output implied to use the new settings.
5. Generate, then select Copy with permission granted.
   - **Expected:** success appears only after the actual clipboard write. Paste into a disposable local text field to confirm; do not submit it externally.
6. Deny clipboard access in site settings or test an unsupported browser context.
   - **Expected:** no false success; output selected when possible; manual-copy explanation appears.
7. Select Analyze generated password.
   - **Expected:** Analyzer opens, input mirrors the generated value in masked form, and its actual assessment appears.
8. Select Clear generated password.
   - **Expected:** generated output/copy feedback clear and dependent buttons disable. Copied system clipboard content is explicitly not promised to be cleared.
9. In a controlled test session with `crypto` unavailable, reload.
   - **Expected:** generator disabled with an explanation; local manual analysis and reports still work. No fallback randomness.

## E. Attack estimator

1. Before analysis, open Attack resistance.
   - **Expected:** honest no-current-assessment state; editable example assumptions remain available.
2. Analyze a fixture and return.
   - **Expected:** separate **Total possible candidates** and **Expected guessing attempts**, with N versus N/2; four scenarios with rates, durations, and assumptions.
3. Change the strict online rate to 1 but do not apply.
   - **Expected:** the table still shows the last applied assumptions. Apply with Update assumptions.
   - **Expected after apply:** the table recalculates, the analysis score stays unchanged, and any old report is cleared.
4. Try zero, negative, non-finite, or out-of-range rates.
   - **Expected:** validation message; the previously applied table remains accurate. Restore example rates.
5. Analyze a very long synthetic string at the input cap.
   - **Expected:** finite scientific notation and readable durations, never `Infinity` or `NaN`.
6. Compare a long repeated word with a random candidate.
   - **Expected:** detected repetition produces high pattern-guessing risk even if theoretical duration is enormous; no actual cracking or account access occurs.

## F. Common and breach checks

### Local list

1. Compare `password` with `Password` and `P@ssw0rd`.
   - **Expected:** exact case-sensitive entry only for the first; separate heuristic warnings can appear for the others.
2. Select Run local check.
   - **Expected:** it uses the current analyzed input and creates no request. It never claims that absence proves safety.

### Optional live service — perform yourself only if desired

The automated suite uses mocked responses only. This manual step is optional, requires Internet, and should use only public synthetic examples.

1. Type, blur, navigate, analyze, and generate while watching Network.
   - **Expected:** no request to the external breach service.
2. With a current analysis, open Breach exposure. Read the disclosure; explicitly click Check.
   - **Expected:** loading indicator, Cancel control, and exactly a range request to `https://api.pwnedpasswords.com/range/` with five uppercase hex characters. A browser CORS preflight may also occur. No POST body, plaintext, complete hash, or suffix is transmitted. The GET requests response padding.
3. Complete a real check only if you want to verify live reachability.
   - **Expected:** actual exposure occurrence count if the suffix matches; otherwise **No match found in the checked dataset**. Do not demand a predetermined count: the live dataset can change.
4. Simulate Offline in DevTools and retry.
   - **Expected:** **Check failed**, never a negative result. All local tools still work.
5. With request throttling enabled, cancel or edit input while a check is pending.
   - **Expected:** pending work cancelled/invalidated; a late response cannot revive old exposure or report state. A fresh analysis is required after input edits.
6. Do not attack or rate-limit the live API to test errors. Use the mocked automated suite for 429, malformed data, large counts, body failures, and timeouts.
7. In an insecure/non-Web-Crypto context:
   - **Expected:** a clear unavailable explanation; no plaintext or alternate insecure request.

## G. Reports and export

1. Open Report without analysis.
   - **Expected:** unavailable report, disabled export/print controls.
2. Analyze, but do not check exposure. Generate report.
   - **Expected:** title, actual date/time, score/classification, counts, theoretical entropy and assumptions, weaknesses, recommendations, N and N/2, four rate scenarios, risk indicators, local result, **Not checked** exposure, limitations, and next steps.
3. With a mocked or optional actual exposure result, generate again.
   - **Expected:** exactly the actual check state. A failed request says **Check failed**; missing date says **Not available**; successful absence says **No match found in the checked dataset**.
4. Download HTML and Text.
   - **Expected:** browser-native local download with date-based filename, matching preview content, no upload. Search each file for your synthetic password and a locally computed full hash—neither is included.
5. Open the downloaded HTML offline.
   - **Expected:** self-contained readable styling, no external assets/scripts. HTML-looking report test fields are escaped, not executed.
6. Select Print / PDF, then cancel once and Save as PDF once.
   - **Expected:** only the report is printed, never sidebar, passwords, or controls. Verify page breaks and your browser/OS PDF destination. Optional browser headers/footers are browser settings, not application content.
7. Select Clear report.
   - **Expected:** preview and exports clear while the current analysis remains. Previously downloaded files are not deleted.
8. Start a breach check while a report exists.
   - **Expected:** report invalidated; generation disabled until the check finishes or is cancelled. Unfinished work is not labeled as a completed result.
9. Try browser Print with no generated report.
   - **Expected:** explanatory no-current-report message rather than printing input fields.

## H. Responsive and accessibility checks

1. Inspect all ten sections at 320, 360, 390, 768, 1024, and 1440 CSS pixels.
   - **Expected:** no horizontal page overflow; cards stack logically; tables scroll inside wrappers; no clipped controls.
2. On mobile, open menu, Tab around it, press Escape, reopen, and select a destination.
   - **Expected:** backdrop, contained focus loop, Escape closure, restored focus, correct section, hidden sidebar removed from keyboard order with `inert`.
3. Increase text/browser zoom to 200%; try OS large-text settings.
   - **Expected:** readable controls and reflow. Note any device-specific problems for future improvement.
4. Enable Reduce motion.
   - **Expected:** transitions/spinner animation stop; textual loading messages remain.
5. Use a screen reader with labels and dynamic status messages.
   - **Expected:** meaningful view heading, password visibility button names, check/error statuses, and educational score meter. Automated axe scans do not substitute for this step.
6. Repeat clipboard/download/print on Safari/iOS and Firefox.
   - **Expected:** clear browser-specific fallback or successful operation, never a false success or fabricated result.

## What remains a human responsibility

- Verify a real API request only if comfortable with the disclosed metadata.
- Test your actual Kali Firefox ESR/profile, Safari/mobile devices, and preferred assistive technologies. Headless Firefox/Chromium evidence does not validate your OS/profile/native dialogs.
- Check native permission prompts, browser print destinations, printer margins, and PDF page breaks on the submission machine.
- Keep screenshots and demo recordings free of genuine credentials.
- Review the limitations before describing PassGuard as a security product rather than an educational assessment tool.
