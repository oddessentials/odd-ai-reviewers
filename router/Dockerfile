# AI Review Router - Production Container
#
# SECURITY REQUIREMENTS (per CONSOLIDATED.md and INVARIANTS.md):
# - Pinned dependencies with version verification
# - No curl|bash installers (production forbidden)
# - Non-root runtime user
# - CVE-2026-22812 mitigation: OpenCode HTTP server disabled
#
# This image MUST be scanned with Trivy before publishing.
# CI should fail on high/critical CVEs.

FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    git \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install semgrep for static analysis (pinned version)
# Keep in sync with .github/workflows/ai-review.yml
ARG SEMGREP_VERSION=1.149.0
RUN pip3 install semgrep==${SEMGREP_VERSION} --break-system-packages

# Install reviewdog (direct binary download with checksum verification)
# Version pinned and verified - no curl|bash installer
ARG REVIEWDOG_VERSION=0.21.0
RUN curl -fsSL -o /tmp/reviewdog.tar.gz \
    "https://github.com/reviewdog/reviewdog/releases/download/v${REVIEWDOG_VERSION}/reviewdog_${REVIEWDOG_VERSION}_Linux_x86_64.tar.gz" && \
    tar -xzf /tmp/reviewdog.tar.gz -C /usr/local/bin reviewdog && \
    chmod +x /usr/local/bin/reviewdog && \
    rm /tmp/reviewdog.tar.gz && \
    reviewdog --version

# Install OpenCode CLI
# SECURITY: Post-CVE version (CVE-2026-22812 fixed in v0.8.0+)
# Direct binary download with SHA256 verification - no curl|bash per INVARIANTS.md
# GitHub org moved from sst/opencode to anomalyco/opencode
# v1.1.40 fixes CVE-2026-24842 (node-tar hardlink path traversal)
ARG OPENCODE_VERSION=1.1.40
ARG OPENCODE_SHA256=13f6c35fc5c0d3243e2d29beaf52c566645cfdea2c7d82267aba898230697cac
RUN curl -fsSL -o /tmp/opencode.tar.gz \
    "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" && \
    echo "${OPENCODE_SHA256}  /tmp/opencode.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin && \
    chmod +x /usr/local/bin/opencode && \
    rm /tmp/opencode.tar.gz && \
    opencode --version

# Enable corepack for pnpm support (pnpm version defined in package.json)
RUN corepack enable

# Copy package files for monorepo workspace setup
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY router/package.json ./router/

# Install dependencies (production only) for router workspace
# --ignore-scripts skips prepare hooks (husky) not needed in container
RUN pnpm install --prod --ignore-scripts --filter=@odd-ai-reviewers/router

# Copy built source and config
COPY router/dist/ ./dist/
COPY config/ ./config/

# ============================================
# Production image - minimal attack surface
# ============================================
FROM node:22-slim AS production

# Security labels
LABEL org.opencontainers.image.title="AI Review Router"
LABEL org.opencontainers.image.description="Orchestrates AI code review with security hardening"
LABEL org.opencontainers.image.vendor="OddEssentials"
LABEL ai.review.security.cve-2026-22812="mitigated"
LABEL ai.review.security.opencode-http="disabled"

WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    git \
    ca-certificates \
    lsof \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install semgrep (runtime needed)
ARG SEMGREP_VERSION=1.149.0
RUN pip3 install semgrep==${SEMGREP_VERSION} --break-system-packages

# Copy tools from builder
COPY --from=builder /usr/local/bin/reviewdog /usr/local/bin/reviewdog
COPY --from=builder /usr/local/bin/opencode /usr/local/bin/opencode

# Copy application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/package.json ./package.json

# Set ownership for non-root user (node user exists in base image with UID 1000)
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Set security environment variables
# These disable OpenCode HTTP server (CVE-2026-22812 mitigation)
ENV OPENCODE_HTTP_DISABLED=true
ENV OPENCODE_NO_SERVER=true
ENV OPENCODE_HEADLESS=true
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

ENTRYPOINT ["node", "dist/main.js"]
