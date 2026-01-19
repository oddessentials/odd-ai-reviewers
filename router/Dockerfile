FROM node:22-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y python3-pip git curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install semgrep for static analysis
RUN pip3 install semgrep --break-system-packages

# Install reviewdog (version-pinned)
ARG REVIEWDOG_VERSION=v0.20.3
RUN curl -sfL https://raw.githubusercontent.com/reviewdog/reviewdog/refs/heads/master/install.sh | sh -s -- -b /usr/local/bin ${REVIEWDOG_VERSION}

# Install opencode CLI (version-pinned)
ARG OPENCODE_VERSION=v0.7.0
RUN curl -fsSL https://opencode.ai/install | OPENCODE_VERSION=${OPENCODE_VERSION} bash && \
    ln -s /root/.opencode/bin/opencode /usr/local/bin/opencode

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev

# Copy built source
COPY dist/ ./dist/
COPY ../config/ ./config/

# Run as non-root user
RUN useradd -m -s /bin/bash reviewer
USER reviewer

ENTRYPOINT ["node", "dist/main.js"]
