# Security Policy

## Overview

The AI Review Router takes security seriously. This document describes our security practices, vulnerability management, and how to report security issues.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Container Security Scanning

Every PR and push to main triggers automated security scanning:

1. **Trivy Scanner** - Scans the Docker image for HIGH and CRITICAL vulnerabilities
2. **Reviewdog Smoke Test** - Validates binary functionality in the container
3. **Dependabot** - Monitors npm dependencies for known vulnerabilities

### CVE Exception Policy

Some CVEs cannot be immediately fixed because they originate in upstream dependencies we don't control. These are documented in `.trivyignore` with:

- Risk assessment justification
- Upstream tracking information
- 180-day maximum exception lifetime
- Quarterly review cadence

See `.trivyignore` for current exceptions and their justifications.

## Go Binary Monitoring

**Important**: Dependabot does not monitor Go binaries bundled in the Docker image. Manual monitoring is required for:

### Monitored Binaries

| Binary    | Current Version | Go Version | Last Checked |
| --------- | --------------- | ---------- | ------------ |
| reviewdog | 0.21.0          | Go 1.25.x  | 2026-01-31   |
| OpenCode  | 1.1.40          | Unknown    | 2026-01-31   |

### Manual Review Process

1. **Check upstream releases**: When updating Dockerfile binary versions, review release notes for security fixes
2. **GitHub Security Advisories**: Search [GitHub Advisory Database](https://github.com/advisories) for relevant Go packages
3. **Quarterly review**: Include binary version check in quarterly CVE exception review

### Update Procedure

When a new binary version is available:

1. Update version in `router/Dockerfile`
2. Rebuild and test: `docker build -t odd-ai-reviewers-router:test -f router/Dockerfile .`
3. Run Trivy scan to check if CVEs are resolved
4. Update `.trivyignore` to remove fixed CVEs
5. Update the version table above

## CVE Exception Lifecycle

All CVE exceptions in `.trivyignore` follow a 180-day maximum lifecycle:

1. **Creation**: Document CVE with risk assessment and justification
2. **Quarterly Review**: Every 90 days, verify if upstream fix is available
3. **Expiration**: At 180 days, exception must be re-approved or removed
4. **Removal**: When upstream fix is released, update dependencies and remove exception

See `specs/001-security-cve-cleanup/SETUP-INSTRUCTIONS.md` for the full review checklist.

## Dependency Management

### npm Dependencies

- Monitored automatically by GitHub Dependabot
- Security updates create automatic PRs
- Critical/High severity updates are prioritized

### Transitive Dependencies

When Dependabot cannot update a transitive dependency, use pnpm overrides in `package.json`:

```json
{
  "overrides": {
    "vulnerable-package": "^fixed.version"
  }
}
```

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email security concerns to the repository maintainers
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested fixes

We aim to respond within 48 hours and will work with you on responsible disclosure.

## Security Controls

### Runtime Protections

- **Token Stripping**: API tokens are stripped before subprocess execution
- **Socket Listener Guards**: Prevents CVE-2026-22812 exploitation in OpenCode
- **Subprocess Isolation**: OpenCode runs in isolated subprocess with limited capabilities

### Build-time Protections

- **Frozen Lockfile**: `pnpm install --frozen-lockfile` prevents supply chain attacks
- **CODEOWNERS**: Security-sensitive files require team review
- **Branch Protection**: PRs require approval before merge

## Acknowledgments

We appreciate the security research community's efforts in identifying and responsibly disclosing vulnerabilities.
