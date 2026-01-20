# OSCR Integration (Conceptual Overview)

## What is OSCR?

[Odd Self-Hosted CI Runtime (OSCR)](https://github.com/oddessentials/odd-self-hosted-ci-runtime) is a Docker-first, provider-pluggable self-hosted CI runtime that runs GitHub Actions and Azure DevOps pipelines at zero cloud cost.

## How odd-ai-reviewers Runs in OSCR

```
[ OSCR Host ]
    |
    ├─ OSCR Runner Container (oddessentials/oscr-github or oscr-azure-devops)
    │   └─ GitHub Actions Workflow Execution
    │       └─ odd-ai-reviewers/.github/workflows/ai-review.yml
    │           └─ Router (node router/dist/main.js)
    │               └─ Calls agents (semgrep, opencode, local_llm, etc.)
    │
    └─ Optional: Ollama Service Container
        └─ Serves models for local_llm agent
```

**Key Points:**

- odd-ai-reviewers **runs inside** OSCR runner containers as part of GitHub Actions workflows
- It does **not** "deploy to OSCR" - it's executed by OSCR's runners
- OSCR runner containers are: `oddessentials/oscr-github` and `oddessentials/oscr-azure-devops`

## Environment Variables

When running in OSCR, configure these environment variables in the OSCR runner setup:

```bash
# Required for local_llm agent
OLLAMA_BASE_URL=http://ollama:11434

# Optional
OLLAMA_MODEL=codellama:7b
LOCAL_LLM_OPTIONAL=false  # fail-closed by default
```

## Ollama Deployment Options

**Option A: Ollama as OSCR Service**

- Add Ollama to OSCR's docker-compose configuration
- Shared network for inter-container communication
- **Deployment details:** See [OSCR repository](https://github.com/oddessentials/odd-self-hosted-ci-runtime)

**Option B: Ollama on Host**

- Run Ollama directly on the OSCR host machine
- OSCR runners connect via host networking
- Simpler setup, less container isolation

**Option C: External Ollama Service**

- Run Ollama on a separate dedicated server
- OSCR runners connect via `OLLAMA_BASE_URL`
- Best for multi-runner deployments

> **Note:** Ollama setup and orchestration belongs in the [OSCR repository](https://github.com/oddessentials/odd-self-hosted-ci-runtime), not odd-ai-reviewers. This repo is deployment-agnostic and only requires a reachable Ollama HTTP endpoint.

## Model Provisioning

When running in OSCR, model provisioning is handled by the OSCR host operator. See:

- [Model Provisioning Guide](./MODEL-PROVISIONING.md) for generic strategies
- [OSCR repository](https://github.com/oddessentials/odd-self-hosted-ci-runtime) for OSCR-specific deployment patterns

## Workflow Configuration

No changes needed to your `.github/workflows/ai-review.yml` workflow file. Just ensure environment variables are set in the OSCR runner configuration.

## Repo Boundary

> **Important for Contributors:**
>
> **odd-ai-reviewers** is a workflow/tooling repository that runs **inside** CI runners.  
> **odd-self-hosted-ci-runtime** manages runner orchestration, compose files, and container topology.
>
> **If your change involves any of the following, it belongs in [odd-self-hosted-ci-runtime](https://github.com/oddessentials/odd-self-hosted-ci-runtime), NOT here:**
>
> - Runner orchestration or lifecycle management
> - Docker Compose files or service definitions
> - Sidecar containers or network configuration
> - Container resource limits or health checks
> - Model provisioning infrastructure
>
> odd-ai-reviewers should only:
>
> - Define agent behavior and configuration
> - Document required environment variables
> - Provide configuration examples and troubleshooting

## Guardrail Note for Contributors

> **If a change modifies runner orchestration, compose files, or container topology, it belongs in [odd-self-hosted-ci-runtime](https://github.com/oddessentials/odd-self-hosted-ci-runtime), not odd-ai-reviewers.**

This repository is a **workflow/tooling repo** that runs inside CI runners. It does not manage runtime infrastructure.
