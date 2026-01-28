# Azure DevOps + OSCR Free Tier Example

> Complete example using Semgrep (static analysis), Reviewdog (annotations), and Ollama (local LLM) — **100% free, no cloud API costs**.

## Prerequisites

Before using this example, ensure:

1. **Build Service has PR permissions** — Grant "Contribute to pull requests" to your Build Service. See [ADO Setup Guide](../platforms/azure-devops/setup.md#4-configure-repository-permissions).
2. **OSCR agent with `ai-review` capability** — Your self-hosted agent needs the Ollama sidecar.
3. **`fetchDepth: 0`** — Required for git diff to work correctly.

## Repository Configuration

Create `.ai-review.yml` in your repository root:

```yaml
# <root>/.ai-review.yml

version: 1
trusted_only: true

triggers:
  on: [pull_request]
  branches: [main]

passes:
  - name: static
    agents: [semgrep, reviewdog] # Both free!
    enabled: true
    required: true
  - name: local-ai
    agents: [local_llm]
    enabled: true
    required: false # Skip if Ollama unavailable

limits:
  max_files: 150
  max_diff_lines: 100000
  max_tokens_per_pr: 700000
  max_usd_per_pr: 0.00 # Free with local LLM!
  monthly_budget_usd: 0 # Free with local LLM!

models:
  default: codellama:7b # Or: deepseek-coder:6.7b, llama3.2:3b

reporting:
  ado:
    mode: threads_and_status
    max_inline_comments: 50
    summary: true
    thread_status: active

gating:
  enabled: false
  fail_on_severity: error
```

## Azure Pipelines Configuration

Create `azure-pipelines.yml` in your repository:

```yaml
# azure-pipelines.yml

trigger:
  branches:
    include:
      - main
      - feature/*

pr:
  branches:
    include:
      - main

schedules:
  - cron: '0 3 * * *' # 3 AM UTC daily
    displayName: Nightly E2E Full Suite
    branches:
      include:
        - main
    always: true

variables:
  NODE_VERSION: '22.x'
  # Centralized secret scanning patterns
  REDACTION_REGEX: '\[(REDACTED|MASKED)\]'
  SECRET_REGEX: '(access_token|refresh_token)=[^&[:space:]]{8,}|(Authorization: )?Bearer [A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

stages:
  # -------------------------
  # AI Review Stage (PR Only)
  # -------------------------
  - stage: AIReview
    displayName: AI Code Review
    condition: eq(variables['Build.Reason'], 'PullRequest')
    jobs:
      - job: Review
        pool:
          name: Default
          demands:
            - ai-review # OSCR agent with Ollama sidecar
        steps:
          - checkout: self
            fetchDepth: 0

          - task: NodeTool@0
            displayName: Setup Node.js
            inputs:
              versionSpec: '$(NODE_VERSION)'

          # Clone odd-ai-reviewers (or use as submodule/package)
          - script: |
              git clone https://github.com/oddessentials/odd-ai-reviewers.git /tmp/odd-ai-reviewers
              cd /tmp/odd-ai-reviewers
              npm ci
              npm run build
            displayName: Setup AI Reviewers

          - script: |
              cd /tmp/odd-ai-reviewers
              # Router auto-resolves refs/heads/* to origin/* internally
              node router/dist/main.js review \
                --repo $(Build.SourcesDirectory) \
                --base $(System.PullRequest.TargetBranch) \
                --head $(Build.SourceVersion)
            displayName: Run AI Review
            env:
              # Ollama connection (OSCR sidecar)
              OLLAMA_BASE_URL: http://ollama-sidecar:11434
              OLLAMA_MODEL: codellama:7b
              # ADO API access for PR comments
              SYSTEM_ACCESSTOKEN: $(System.AccessToken)

  # -------------------------
  # CI Stage
  # -------------------------
  - stage: CI
    displayName: CI
    jobs:
      - job: quality
        displayName: quality
        pool:
          name: Default
          demands:
            - Agent.OS -equals Linux
            - docker
        steps:
          - checkout: self
            persistCredentials: true

          - task: NodeTool@0
            displayName: Setup Node.js
            inputs:
              versionSpec: '$(NODE_VERSION)'

          - script: npm ci
            displayName: Install dependencies

          - script: npm run format:check
            displayName: Format Check

          - script: npm run lint
            displayName: Lint

          - script: npm audit --omit=dev --audit-level=critical
            displayName: Security Audit (Production)

          - script: npm run build --workspace=shared
            displayName: Build Shared Package

          - script: npm test --if-present
            displayName: Test

          # Secret leak check (advisory only)
          - script: |
              echo "🔍 Scanning for potential secret leaks..."
              FOUND_LEAKS=0
              SCAN_DIRS="server client shared e2e"
              EXCLUDES="--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=e2e-logs"
              FILE_TYPES="--include=*.ts --include=*.js --include=*.json"
              TEST_EXCLUDES="--exclude=*.test.ts --exclude=*.spec.ts"

              if grep -rEih $EXCLUDES $FILE_TYPES $TEST_EXCLUDES $SCAN_DIRS 2>/dev/null \
                | sed -E "s/$(REDACTION_REGEX)//Ig" \
                | grep -E "$(SECRET_REGEX)" | head -20; then
                echo "⚠️ Potential secret pattern in source files"
                FOUND_LEAKS=1
              fi

              if [ "$FOUND_LEAKS" -eq 1 ]; then
                echo "❌ Potential secret patterns detected - review above"
              else
                echo "✅ No secret patterns detected"
              fi
            displayName: Secret Leak Check (Advisory)

      - job: build
        displayName: build
        dependsOn: quality
        condition: succeeded()
        pool:
          name: Default
          demands:
            - Agent.OS -equals Linux
            - docker
        steps:
          - checkout: self
            persistCredentials: true

          - task: NodeTool@0
            displayName: Setup Node.js
            inputs:
              versionSpec: '$(NODE_VERSION)'

          - script: npm ci
            displayName: Install dependencies

          - script: npm run build
            displayName: Build
```

## Free-Tier Agents Explained

| Agent       | What It Does                              | Cost   |
| ----------- | ----------------------------------------- | ------ |
| `semgrep`   | Static analysis with 2000+ security rules | Free   |
| `reviewdog` | Enhanced annotation formatting            | Free   |
| `local_llm` | AI review via local Ollama                | Free\* |

\*Requires compute resources to run Ollama

## OSCR Setup Requirements

For the AI review to work, your OSCR agent needs:

1. **Ollama sidecar** running with models pre-pulled
2. **Agent demand label** `ai-review` configured
3. **Network access** to the Ollama sidecar

See [OSCR Integration Guide](../platforms/oscr/integration.md) for full setup.

## Environment Variables Reference

| Variable             | Purpose                      | Set By       |
| -------------------- | ---------------------------- | ------------ |
| `OLLAMA_BASE_URL`    | Ollama API endpoint          | Pipeline     |
| `OLLAMA_MODEL`       | Model to use (e.g., llama3)  | Pipeline     |
| `SYSTEM_ACCESSTOKEN` | ADO API token for PR posting | Azure DevOps |
| `TF_BUILD`           | ADO platform detection       | Azure DevOps |

## Related Documentation

- [ADO Setup Guide](../platforms/azure-devops/setup.md)
- [Local LLM Setup](../platforms/oscr/local-llm-setup.md)
- [OSCR Integration](../platforms/oscr/integration.md)
