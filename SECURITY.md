# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in CloakPDF, please **do not** open a public GitHub issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/sumitsahoo/cloakpdf/security/advisories/new).

You can expect:

- **Acknowledgement** within 48 hours
- **Status update** within 7 days
- Credit in the advisory once the fix is released (if desired)

## Security Model

CloakPDF is a **client-side only** application — all PDF processing happens in your browser. No files or data are transmitted to any server. The attack surface is limited to:

- Third-party npm dependencies (monitored via `pnpm audit` in CI and Dependabot)
- Browser sandbox escape (out of scope — report to the browser vendor)

## Dependency Vulnerabilities

Known dependency vulnerabilities are tracked automatically via GitHub Dependabot and the weekly security audit workflow. If you spot one that has not been addressed, please follow the disclosure process above.
