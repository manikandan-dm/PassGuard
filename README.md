# PassGuard
### Password Strength and Security Assessment Tool

**A local-first security workspace. Understand your passwords without giving them away.**

PassGuard is a framework-free password security assessment platform built with HTML, CSS, and vanilla JavaScript. It helps users evaluate password strength, identify predictable patterns, estimate theoretical attack resistance, generate secure passwords, optionally check known breach exposure, and create security assessment reports.

Designed for cybersecurity education, academic demonstrations, and frontend development portfolios, PassGuard combines a modern security dashboard with transparent analysis and privacy-conscious workflows.

![PassGuard Security Dashboard](docs/screenshots/overview.png)

> **Important:** Use synthetic passwords for demonstrations. Password scores and attack-time estimates are educational indicators, not guarantees of security.

## Features

- **Security Dashboard:** View assessment status, strength scores, detected weaknesses, and recommended next steps.
- **Password Analyzer:** Analyze password length, character categories, predictable patterns, and common weaknesses.
- **Password Generator:** Generate passwords with configurable length and character categories.
- **Attack Resistance Estimation:** Compare theoretical search-space estimates across hypothetical online and offline attack scenarios.
- **Common Password Detection:** Identify exact matches against a built-in list of common password examples.
- **Breach Exposure Check:** Optionally check a password against the Have I Been Pwned Pwned Passwords service.
- **Security Recommendations:** Receive actionable guidance based on the assessment.
- **Security Reports:** Preview and export reports in HTML or text, with browser printing and PDF support.
- **Privacy Controls:** Keep password analysis local and make external breach checks an explicit user action.
- **Responsive Interface:** Support desktop and mobile layouts, dark and light themes, and keyboard-accessible navigation.

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Responsive interface, themes, and print styles |
| Vanilla JavaScript | Analysis logic, state management, and UI interactions |
| Node.js 20+ | Local development server and native testing |
| Browser APIs | Clipboard, downloads, and supported security operations |
| Playwright and axe-core | Optional browser testing and accessibility checks |

The application does not require a frontend framework, build system, application backend, or database for normal local use.

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm
- A modern web browser, such as Firefox

### Installation

Clone the repository and enter the project directory:

```bash
git clone https://github.com/manikandan-dm/PassGuard.git
cd PassGuard
```

### Run the application

```bash
npm run dev
```

Open the local application:

**http://localhost:3000**

Alternatively, on Linux or Kali Linux:

```bash
chmod +x start-passguard.sh
./start-passguard.sh
```

The launcher starts the local server using the configured host and port. Keep the owning terminal open while the server is running. Press `Ctrl+C` to stop it.

For Windows, use the included `start-passguard.bat` launcher.

**Note:** Normal application startup does not require `npm install` if the project uses only its built-in Node.js server. Install dependencies when needed for optional development or browser-testing tools.

## How to Use

1. Open the PassGuard dashboard.
2. Enter a synthetic password in the analyzer.
3. Run the assessment and review the strength score and detected weaknesses.
4. Read the recommendations and attack-resistance estimates.
5. Use the password generator to create a password with your preferred settings.
6. Optionally run a breach exposure check after reviewing its privacy implications.
7. Generate and export a security report.
8. Clear the workspace when finished.

## Password Assessment Model

PassGuard uses a transparent, rule-based scoring model that considers password length, character categories, and detected patterns.

The result is classified into three levels:

- **Weak:** 0–39
- **Medium:** 40–69
- **Strong:** 70–100

The score is a heuristic assessment, not a calibrated measurement of an attacker's actual success probability. A strong score does not prove that a password is random, unique, or absent from breach datasets.

### Attack resistance estimates

The application estimates theoretical search-space size and expected exhaustive-search time using assumed character pools and configurable guessing rates.

These calculations are illustrative. Actual attack resistance depends on password predictability, password-hashing algorithms, hardware, rate limits, attacker knowledge, and other security controls. PassGuard does not perform password cracking or attempt to access accounts.

## Privacy and Security

PassGuard is designed to perform password analysis in the browser without sending passwords to a PassGuard backend.

- Passwords and assessment results are handled in application memory.
- The application does not require a PassGuard database or account.
- Breach checking is optional and initiated explicitly by the user.
- The breach-check workflow sends a partial hash prefix to the external service rather than the plaintext password or complete hash.
- Network requests, browser behavior, clipboard contents, and downloaded reports remain subject to their respective platform limitations.

The breach-check feature requires an internet connection and depends on the availability of the external service. A failed check must not be interpreted as proof that a password has never appeared in a breach.

## Testing

Run the automated test suite:

```bash
npm test
```

Additional commands may be available in `package.json`:

```bash
npm run test:local
npm run test:server
```

Optional browser testing can use Playwright and the supported test-browser installation. Consult the project documentation for the exact setup and commands.

Automated tests may use synthetic passwords and mocked breach responses. Mocked results do not establish that a live external service was successfully tested.

## Project Structure

```text
PassGuard/
├── index.html
├── assets/
├── css/
├── js/
├── scripts/
├── tests/
├── docs/
│   ├── screenshots/
│   ├── architecture.md
│   ├── manual-testing.md
│   ├── security-audit.md
│   ├── test-results.md
│   └── localhost-setup.md
├── package.json
├── package-lock.json
├── start-passguard.sh
├── start-passguard.bat
└── README.md
```

- `index.html` — Main application page.
- `css/` — Layout, responsive styling, themes, and print styles.
- `js/` — Password analysis, generation, attack estimates, breach checking, state management, and reports.
- `scripts/` — Local server and startup utilities.
- `tests/` — Automated unit, security-structure, server, and optional browser tests.
- `docs/` — Architecture, security review, setup instructions, screenshots, and test evidence.

## Documentation

- [Architecture](docs/architecture.md)
- [Security Audit](docs/security-audit.md)
- [Manual Testing](docs/manual-testing.md)
- [Test Results](docs/test-results.md)
- [Local Setup Guide](docs/localhost-setup.md)

## Limitations

- Password strength is estimated using heuristics and a limited set of known patterns.
- Common-password detection uses a small bundled list and cannot identify every weak password.
- Attack-time estimates depend on theoretical assumptions and do not represent real-world benchmarks.
- Breach checking depends on network connectivity and the external service.
- Browser memory cannot be guaranteed to be forensically erased by JavaScript.
- PassGuard is an educational password assessment tool, not a password manager, authentication service, or professional penetration-testing platform.

## Project Status

PassGuard is a cybersecurity project focused on password security assessment, privacy awareness, and educational demonstrations.

## License

No license has been specified for this repository. Add a license before granting others explicit permission to redistribute or modify the project.

---

**PassGuard — Better passwords. Better security awareness.**
