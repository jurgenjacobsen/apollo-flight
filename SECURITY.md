# Security Policy

Apollo Flight is committed to ensuring the safety, integrity, and privacy of flight simulation enthusiasts using our desktop software. This policy outlines how vulnerabilities are handled, supported versions, and responsible disclosure procedures.

---

## Supported Versions

Security updates are actively applied to the latest minor and patch releases:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |
| < 0.0.4 | :x:                |

We strongly encourage all pilots to update to the latest release to ensure you have the latest security patches, bug fixes, and telemetry engine improvements.

---

## Reporting a Vulnerability

If you discover a security vulnerability or security-related bug in Apollo Flight:

1. **Do not open a public issue.** Public disclosure puts the community at risk before a fix can be prepared and released.
2. **Submit a Private Vulnerability Report:**
   - Use [GitHub Security Advisories](https://github.com/jurgenjacobsen/apollo-flight/security/advisories/new) to report the vulnerability privately.

### What to Include in Your Report
To help us triage and resolve the issue quickly, please provide:
- A clear description of the vulnerability.
- Steps to reproduce or a minimal proof-of-concept (PoC).
- Affected version(s) of Apollo Flight.
- Operating system environment (e.g. Windows 11 64-bit).
- Any potential impact on local files, processes, or inter-process communication.

---

## Response & Resolution Process

- **Acknowledgment:** We aim to acknowledge vulnerability reports as soon as possible.
- **Assessment:** We will verify the issue and determine its severity and blast radius.
- **Remediation:** A patch will be developed, tested, and released as a hotfix or in the next minor version.
- **Credit:** We gladly credit security researchers and community contributors in release notes and security advisories (unless you prefer anonymity).

---

## Security Architecture & Boundaries

Apollo Flight is built on **Tauri v2** with a strict security model:

1. **Principle of Least Privilege:**
   - The webview runs with minimal system access.
   - Native system capabilities (system tray, shell opening, file dialogs) are explicitly defined and locked down in `src-tauri/capabilities/default.json`.
2. **Safe External Navigation:**
   - External links (such as GitHub issue reporting or documentation) validate protocol schemes (`https://` only) and launch exclusively via the operating system's default browser outside the application webview.
3. **Local IPC & FSUIPC Bridge:**
   - SimConnect and FSUIPC communication uses local Windows shared memory / message pump IPC without exposing external network ports, sockets, or listening servers on the host machine.
4. **Local-First SQLite Storage:**
   - All user data and navigational records are stored locally in isolated SQLite databases (`logbook.db` and `navdata.db`) under the user's OS application data directory with standard user file permissions.
