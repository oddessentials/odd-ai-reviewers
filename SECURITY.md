Run aquasecurity/trivy-action@0.28.0
Run aquasecurity/setup-trivy@v0.2.1
Run echo "dir=$HOME/.local/bin/trivy-bin" >> $GITHUB_OUTPUT
Run actions/cache@v4
Cache hit for: trivy-binary-v0.56.1-Linux-X64
Received 4194304 of 37384196 (11.2%), 4.0 MBs/sec
Received 37384196 of 37384196 (100.0%), 28.9 MBs/sec
Cache Size: ~36 MB (37384196 B)
/usr/bin/tar -xf /home/runner/work/_temp/c2efe100-a9af-47bc-aa33-830d0a136877/cache.tzst -P -C /home/runner/work/odd-ai-reviewers/odd-ai-reviewers --use-compress-program unzstd
Cache restored successfully
Cache restored from key: trivy-binary-v0.56.1-Linux-X64
Run echo /home/runner/.local/bin/trivy-bin >> $GITHUB_PATH
Run echo "date=$(date +'%Y-%m-%d')" >> $GITHUB_OUTPUT
Run actions/cache@v4
Cache hit for restore-key: cache-trivy-2026-01-31
Received 4194304 of 59892428 (7.0%), 4.0 MBs/sec
Received 59892428 of 59892428 (100.0%), 37.6 MBs/sec
Cache Size: ~57 MB (59892428 B)
/usr/bin/tar -xf /home/runner/work/_temp/08efac0d-7a1d-4f50-9054-d7d8512b0afd/cache.tzst -P -C /home/runner/work/odd-ai-reviewers/odd-ai-reviewers --use-compress-program unzstd
Cache restored successfully
Cache restored from key: cache-trivy-2026-01-31
Run echo "$GITHUB_ACTION_PATH" >> $GITHUB_PATH
Run # Note: There is currently no way to distinguish between undefined variables and empty strings in GitHub Actions.
Run entrypoint.sh
Found ignorefile '.trivyignore':

# Trivy CVE Ignore List

#

# This file documents known CVEs that are accepted risks with justification.

# All CVEs here are from third-party binaries we do not control.

#

# Last reviewed: 2026-01-19 by AI Review Router team

# ============================================================================

# OpenCode CLI Binary (Go runtime CVEs)

#

# OpenCode v1.1.26 is compiled with an older Go runtime that contains these

# vulnerabilities. We are using the latest available release. The OpenCode

# team must release a new version compiled with Go 1.24.11+ or 1.25.5+ to fix.

#

# Risk assessment: LOW - OpenCode runs in isolated subprocess with stripped

# tokens and socket listener guards (CVE-2026-22812 mitigation in place).

# ============================================================================

# Go crypto/x509 - DoS via malformed certificate

# Fixed in: Go 1.24.11, 1.25.5 | OpenCode compiled with older Go

CVE-2025-61729

# Go database/sql - Postgres scanning vulnerability

# Fixed in: Go 1.23.12, 1.24.6 | OpenCode compiled with older Go

CVE-2025-47907

# Go archive/tar - Unbounded allocation parsing GNU tar headers

# Fixed in: Go 1.23.12, 1.24.6 | OpenCode compiled with older Go

CVE-2025-58183

# ============================================================================

# npm transitive dependencies (if any appear and need exceptions)

# ============================================================================

# glob package - Command injection via malicious pattern

# This is a transitive dependency in Docker image tooling

# Risk: LOW - Not used in our application code, comes from build tools

CVE-2025-64756

# ============================================================================

# Additional Go dependencies in OpenCode binary

# ============================================================================

# golang.org/x/oauth2/jws - Unexpected memory consumption

# Fixed in: 0.27.0 | OpenCode compiled with older version

# Risk: LOW - OpenCode runs isolated with token stripping

CVE-2025-22868

# Go encoding/gob - Decoder.Decode stack exhaustion

# Fixed in: Go 1.22.7, 1.23.1 | OpenCode compiled with older Go

# Risk: LOW - OpenCode doesn't use gob in user-facing paths

CVE-2024-34156

# node-tar - Path traversal vulnerability in tar extraction

# This is a transitive dependency in npm tooling

# Risk: LOW - Only used during Docker build, not at runtime

CVE-2026-23745

# node-tar - Arbitrary file overwrite via Unicode path collision race condition

# This is bundled with npm in the node:22-slim base image

# Risk: LOW - Only used during npm ci in Docker build, not at runtime

CVE-2026-23950

# node-tar - Hardlink path traversal (CVE-2026-24842)

# tar 6.2.1 bundled in npm (node:22-slim), tar 7.4.3 bundled in OpenCode 1.1.40

# Fixed in node-tar 7.5.7 | Waiting for upstream releases

# Risk: LOW - Only used during Docker build, not at runtime

CVE-2026-24842

# golang.org/x/crypto/ssh - Authorization bypass in SSH handshake

# Fixed in: 0.31.0 | OpenCode compiled with v0.28.0

# Risk: LOW - OpenCode doesn't use SSH for LLM API calls

CVE-2024-45337

# Go net/http2 - Unlimited CONTINUATION frames causing resource exhaustion

# Fixed in: Go 1.21.9, 1.22.2 | OpenCode compiled with older Go

# Risk: LOW - OpenCode CLI mode doesn't run HTTP2 servers

CVE-2023-45288

# ============================================================================

# Reviewdog Binary (Go runtime and library CVEs)

#

# Reviewdog v0.20.3 is compiled with Go 1.21.7 which contains these

# vulnerabilities. These are inherited from upstream releases.

# ============================================================================

# golang.org/x/crypto/ssh - DoS in SSH key exchange

# Fixed in: 0.35.0 | Reviewdog compiled with v0.28.0

# Risk: LOW - Reviewdog doesn't use SSH functionality

CVE-2025-22869

# Go net/netip - Unexpected behavior for IPv4-mapped IPv6 addresses

# Fixed in: Go 1.21.11, 1.22.4 | Reviewdog compiled with Go 1.21.7

# Risk: LOW - Reviewdog only processes diff/lint data, not network addresses

CVE-2024-24790
Running Trivy with options: trivy image odd-ai-reviewers-router:ci
2026-02-01T00:23:47Z INFO [vulndb] Need to update DB
2026-02-01T00:23:47Z INFO [vulndb] Downloading vulnerability DB...
2026-02-01T00:23:47Z INFO [vulndb] Downloading artifact... repo="ghcr.io/aquasecurity/trivy-db:2"
37.05 MiB / 83.63 MiB [--------------------------->_________________________________] 44.30% ? p/s ?83.63 MiB / 83.63 MiB [----------------------------------------------------------->] 100.00% ? p/s ?83.63 MiB / 83.63 MiB [----------------------------------------------------------->] 100.00% ? p/s ?83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 77.53 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 77.53 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 77.53 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 72.52 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 72.52 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 72.52 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 67.85 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 67.85 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 67.85 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 63.47 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [---------------------------------------------->] 100.00% 63.47 MiB p/s ETA 0s83.63 MiB / 83.63 MiB [-------------------------------------------------] 100.00% 29.88 MiB p/s 3.0s2026-02-01T00:23:51Z INFO [vulndb] Artifact successfully downloaded repo="ghcr.io/aquasecurity/trivy-db:2"
2026-02-01T00:23:51Z INFO [vuln] Vulnerability scanning is enabled
2026-02-01T00:23:51Z INFO [secret] Secret scanning is enabled
2026-02-01T00:23:51Z INFO [secret] If your scanning is slow, please try '--scanners vuln' to disable secret scanning
2026-02-01T00:23:51Z INFO [secret] Please see also https://aquasecurity.github.io/trivy/v0.56/docs/scanner/secret#recommendation for faster secret detection
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="boltons" version="21.0.0"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="certifi" version="2026.1.4"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="glom" version="22.1.0"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="googleapis-common-protos" version="1.72.0"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="h11" version="0.16.0"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="httpx" version="0.28.1"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="mcp" version="1.23.3"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="Pygments" version="2.19.2"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="requests" version="2.32.5"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="rich" version="13.5.3"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="ruamel.yaml" version="0.19.1"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="semgrep" version="1.149.0"
2026-02-01T00:24:02Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="wrapt" version="1.17.3"
2026-02-01T00:24:03Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="pip" version="23.0.1"
2026-02-01T00:24:03Z INFO [python] License acquired from METADATA classifiers may be subject to additional terms name="wheel" version="0.38.4"
2026-02-01T00:24:03Z INFO Detected OS family="debian" version="12.13"
2026-02-01T00:24:03Z INFO [debian] Detecting vulnerabilities... os_version="12" pkg_num=136
2026-02-01T00:24:03Z INFO Number of language-specific files num=3
2026-02-01T00:24:03Z INFO [gobinary] Detecting vulnerabilities...
2026-02-01T00:24:03Z INFO [node-pkg] Detecting vulnerabilities...
2026-02-01T00:24:03Z INFO [python-pkg] Detecting vulnerabilities...
2026-02-01T00:24:03Z WARN Using severities from other vendors for some vulnerabilities. Read https://aquasecurity.github.io/trivy/v0.56/docs/scanner/vulnerability#severity-selection for details.
2026-02-01T00:24:03Z INFO Table result includes only package filenames. Use '--format json' option to get the full path to the package file.

## For OSS Maintainers: VEX Notice

If you're an OSS maintainer and Trivy has detected vulnerabilities in your project that you believe are not actually exploitable, consider issuing a VEX (Vulnerability Exploitability eXchange) statement.
VEX allows you to communicate the actual status of vulnerabilities in your project, improving security transparency and reducing false positives for your users.
Learn more and start using VEX: https://aquasecurity.github.io/trivy/v0.56/docs/supply-chain/vex/repo#publishing-vex-documents

To disable this notice, set the TRIVY_DISABLE_VEX_NOTICE environment variable.

# odd-ai-reviewers-router:ci (debian 12.13)

Total: 0 (HIGH: 0, CRITICAL: 0)

2026-02-01T00:24:03Z INFO Some vulnerabilities have been ignored/suppressed. Use the "--show-suppressed" flag to display them.

# Node.js (node-pkg)

Total: 1 (HIGH: 1, CRITICAL: 0)

┌────────────────────────────────┬────────────────┬──────────┬────────┬───────────────────┬───────────────┬─────────────────────────────────────────────────────────────┐
│ Library │ Vulnerability │ Severity │ Status │ Installed Version │ Fixed Version │ Title │
├────────────────────────────────┼────────────────┼──────────┼────────┼───────────────────┼───────────────┼─────────────────────────────────────────────────────────────┤
│ fast-xml-parser (package.json) │ CVE-2026-25128 │ HIGH │ fixed │ 5.3.3 │ 5.3.4 │ fast-xml-parser: fast-xml-parser has RangeError DoS Numeric │
│ │ │ │ │ │ │ Entities Bug │
│ │ │ │ │ │ │ https://avd.aquasec.com/nvd/cve-2026-25128 │
└────────────────────────────────┴────────────────┴──────────┴────────┴───────────────────┴───────────────┴─────────────────────────────────────────────────────────────┘

# usr/local/bin/reviewdog (gobinary)

Total: 2 (HIGH: 2, CRITICAL: 0)

┌─────────┬────────────────┬──────────┬────────┬───────────────────┬─────────────────┬──────────────────────────────────────────────────────────────┐
│ Library │ Vulnerability │ Severity │ Status │ Installed Version │ Fixed Version │ Title │
├─────────┼────────────────┼──────────┼────────┼───────────────────┼─────────────────┼──────────────────────────────────────────────────────────────┤
│ stdlib │ CVE-2025-61726 │ HIGH │ fixed │ 1.25.0 │ 1.24.12, 1.25.6 │ The net/url package does not set a limit on the number of... │
│ │ │ │ │ │ │ https://avd.aquasec.com/nvd/cve-2025-61726 │
│ ├────────────────┤ │ │ │ ├──────────────────────────────────────────────────────────────┤
│ │ CVE-2025-61728 │ │ │ │ │ golang: archive/zip: Excessive CPU consumption when building │
│ │ │ │ │ │ │ archive index in archive/zip │
│ │ │ │ │ │ │ https://avd.aquasec.com/nvd/cve-2025-61728 │
└─────────┴────────────────┴──────────┴────────┴───────────────────┴─────────────────┴──────────────────────────────────────────────────────────────┘
Error: Process completed with exit code 1.
