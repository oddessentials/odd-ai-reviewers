FROM node:22-slim

WORKDIR /app

# Install semgrep for static analysis
RUN apt-get update && apt-get install -y python3-pip git && \
    pip3 install semgrep --break-system-packages && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

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
