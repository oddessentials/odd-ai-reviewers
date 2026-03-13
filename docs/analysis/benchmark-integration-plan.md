# Code Review Benchmark Integration Plan

Integration plan for [withmartian/code-review-benchmark](https://github.com/withmartian/code-review-benchmark) with odd-ai-reviewers.

---

## 1. Benchmark Architecture

The withmartian benchmark has two evaluation tracks:

### 1.1 Offline Benchmark (Primary Target)

- **Dataset**: 50 curated pull requests across 5 major open-source projects:
  - Sentry (Python), Grafana (Go), Cal.com (TypeScript), Discourse (Ruby), Keycloak (Java)
- **Ground truth**: Human-verified "golden comments" with severity labels (Low/Medium/High/Critical), stored as JSON files per project
- **Evaluation**: LLM-as-judge compares tool findings against golden comments using semantic matching ("different wording is fine if it's the same problem")
- **Pipeline**: 6-step sequential process:
  1. `step0_fork_prs.py` - Fork 50 benchmark PRs into a GitHub org where the tool is installed
  2. `step1_download_prs.py` - Download PR data, reviews, and golden comments via GitHub CLI
  3. `step2_extract_comments.py` - Extract individual issues from review text using LLM
  4. `step3_judge_comments.py` - LLM judge matches extracted issues against golden comments
  5. `step4_export_by_tool.py` - Organize results by tool
  6. `step5_label_prs.py` - Apply categorical labels

### 1.2 Online Benchmark (Future Target)

- Continuously samples fresh real-world PRs from GitHub Archive via BigQuery
- Ground truth: actual developer fixes after bot comments
- Requires the tool to be deployed as a GitHub bot posting review comments
- Not in scope for initial integration

### 1.3 Golden Comment Schema

```json
{
  "pr_title": "string",
  "url": "https://github.com/org/repo/pull/N",
  "original_url": "string (optional, source PR)",
  "az_comment": "string (optional, review notes)",
  "comments": [
    {
      "comment": "Human-readable description of the issue",
      "severity": "Low|Medium|High|Critical"
    }
  ]
}
```

### 1.4 Scoring Methodology

| Metric        | Formula                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| **Precision** | `TP / total_tool_comments` (what fraction of tool comments are real issues) |
| **Recall**    | `TP / total_golden_comments` (what fraction of real issues the tool found)  |
| **F1**        | `2 * precision * recall / (precision + recall)`                             |

- The LLM judge creates pairwise comparisons between golden comments and tool comments
- Each match includes a reasoning and confidence score (0.0-1.0)
- Results are stored per judge model (Claude Opus 4.5, Claude Sonnet 4.5, GPT-5.2) to track variance
- Severity is captured as metadata but NOT used for differential weighting

### 1.5 Currently Benchmarked Tools

Augment, Claude Code, CodeRabbit, Codex, Cursor Bugbot, Gemini, GitHub Copilot, Graphite, Greptile, Propel, Qodo

---

## 2. Adapter Requirements

The benchmark is designed so that **no adapter or harness code is needed** — tools simply review forked PRs via a GitHub bot account, and the benchmark pipeline extracts findings from standard GitHub PR review comments. The benchmark authors describe integration as something that "takes an afternoon."

### 2.1 Integration Path Options

#### Option A: GitHub Bot Review (Recommended — Native Path)

The benchmark's native workflow requires tools to review forked PRs as a GitHub bot. The pipeline then extracts review comments automatically. **No adapter code is needed.**

Steps:

1. Run `step0_fork_prs.py --org OUR_ORG --name odd-ai-reviewers` to fork 50 benchmark PRs
2. Install/trigger our tool on the forked repos (our existing GitHub Actions workflow or a bot account)
3. The benchmark pipeline handles everything else: download, extraction, judging

We already have a GitHub reporter (`router/src/report/github.ts`) and GitHub Actions integration. The main work is:

- Setting up a dedicated GitHub org for benchmark forks
- Configuring our tool to run on PR open events in that org
- Ensuring our GitHub review comments are in standard format (they already are)

**Pros**: Zero adapter code. Official benchmark compatibility. Results appear alongside other tools on the leaderboard.
**Cons**: Requires GitHub App/Actions setup in a dedicated benchmark org. Each of 50 PRs needs a review run.

#### Option B: Offline Results Injection (Alternative for Local Iteration)

For faster development iteration without GitHub infrastructure, we can bypass the GitHub comment flow. Run the CLI locally against each PR's diff and inject results directly into the benchmark's `results/` directory in the format expected by `step3_judge_comments.py`.

The expected candidate format (output of step2):

```json
{
  "golden_url": {
    "tool_name": [
      {
        "text": "issue description",
        "path": "file/path.ts",
        "line": 42,
        "source": "extracted"
      }
    ]
  }
}
```

**Pros**: No GitHub App needed. Faster iteration. Can run locally.
**Cons**: Not compatible with the official fork-and-review workflow. Requires maintaining the injection script. Not suitable for leaderboard submission.

#### Option C: Hybrid (Recommended Strategy)

Use Option B for rapid development iteration and FP/FN analysis. Use Option A for official leaderboard submissions and CI tracking. Both can coexist.

### 2.2 Output Format Mapping

Our CLI JSON output (`--format json`) maps to benchmark candidates as follows:

| Our Finding Field | Benchmark Candidate Field | Mapping                                                            |
| ----------------- | ------------------------- | ------------------------------------------------------------------ |
| `message`         | `text`                    | Direct (primary match target for LLM judge)                        |
| `file`            | `path`                    | Direct                                                             |
| `line`            | `line`                    | Direct                                                             |
| `severity`        | (metadata only)           | `error` -> `High/Critical`, `warning` -> `Medium`, `info` -> `Low` |
| `suggestion`      | Append to `text`          | Concatenate: `"${message}. Suggestion: ${suggestion}"`             |
| `ruleId`          | (not used)                | Ignore                                                             |
| `sourceAgent`     | (not used)                | Set tool name to `"odd-ai-reviewers"`                              |

### 2.3 Adapter Script

A TypeScript adapter script (`scripts/benchmark-adapter.ts`) should:

```typescript
// Pseudocode
async function runBenchmark(prListPath: string, outputPath: string) {
  const prs = JSON.parse(fs.readFileSync(prListPath)); // golden comment files

  for (const pr of prs) {
    // 1. Clone the forked repo at the PR's base/head
    const repoDir = await cloneAndCheckout(pr.url);

    // 2. Run our CLI
    const result = execSync(
      `ai-review local --path ${repoDir} --base ${baseRef} --head ${headRef} --format json`,
      { encoding: 'utf-8' }
    );

    // 3. Transform findings to benchmark candidate format
    const jsonOutput = JSON.parse(result);
    const candidates = jsonOutput.findings.map((f) => ({
      text: f.suggestion ? `${f.message}. Suggestion: ${f.suggestion}` : f.message,
      path: f.file,
      line: f.line ?? null,
      source: 'extracted',
    }));

    // 4. Write to results directory in benchmark format
    writeResults(pr.url, 'odd-ai-reviewers', candidates, outputPath);
  }
}
```

---

## 3. Docker Configuration

### 3.1 Dockerfile for Benchmark Runner

```dockerfile
FROM node:22-bookworm-slim

# Install git, Python (for benchmark pipeline), and uv
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install uv for benchmark pipeline
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy and build odd-ai-reviewers
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

# Clone benchmark repository
RUN git clone https://github.com/withmartian/code-review-benchmark.git /benchmark
WORKDIR /benchmark/offline
RUN uv sync

# Set up entrypoint
WORKDIR /app
COPY scripts/benchmark-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### 3.2 Docker Compose

```yaml
version: '3.8'
services:
  benchmark-runner:
    build:
      context: .
      dockerfile: Dockerfile.benchmark
    environment:
      - GH_TOKEN=${GH_TOKEN}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - MARTIAN_API_KEY=${MARTIAN_API_KEY}
      - MARTIAN_BASE_URL=https://api.withmartian.com/v1
      - MARTIAN_MODEL=openai/gpt-4o-mini
    volumes:
      - ./benchmark-results:/results
    tmpfs:
      - /tmp:size=2G
```

### 3.3 Environment Variables Required

| Variable                                | Purpose                                               | Required For           |
| --------------------------------------- | ----------------------------------------------------- | ---------------------- |
| `GH_TOKEN`                              | GitHub CLI access (downloading PRs)                   | Benchmark step1        |
| `GITHUB_TOKEN`                          | GitHub API access (forking PRs)                       | Benchmark step0        |
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | Our tool's LLM provider                               | Running reviews        |
| `MARTIAN_API_KEY`                       | LLM judge API key                                     | Benchmark step2, step3 |
| `MARTIAN_BASE_URL`                      | Judge API endpoint (`https://api.withmartian.com/v1`) | Benchmark step2, step3 |
| `MARTIAN_MODEL`                         | Judge model (`openai/gpt-4o-mini`)                    | Benchmark step2, step3 |

---

## 4. Metric Mapping

### 4.1 Internal Metrics vs. Benchmark Metrics

| Our Internal Metric                | Benchmark Metric | Relationship                                                 |
| ---------------------------------- | ---------------- | ------------------------------------------------------------ |
| FP suppression rate (>=90% target) | Precision        | **Directly correlated** — FP suppression increases precision |
| TP preservation (>=85% target)     | Recall           | **Directly correlated** — TP preservation maintains recall   |
| Pattern A-E classification         | (none)           | Internal taxonomy; benchmark uses flat TP/FP/FN              |
| Dual-pool scoring                  | F1               | Our dual-pool is analogous; benchmark uses standard F1       |
| Snapshot replay                    | (none)           | Our regression prevention; benchmark is one-shot evaluation  |

### 4.2 Severity Mapping

| Our Severity | Benchmark Severity   | Notes                        |
| ------------ | -------------------- | ---------------------------- |
| `error`      | `High` or `Critical` | Map based on ruleId category |
| `warning`    | `Medium`             | Direct                       |
| `info`       | `Low`                | Direct                       |

### 4.3 Category Mapping

Our categories map loosely to the benchmark's issue types. The benchmark does not enforce categories — the LLM judge evaluates semantic equivalence regardless of category labels.

| Our Category     | Benchmark Relevance                                                       |
| ---------------- | ------------------------------------------------------------------------- |
| `security`       | High — golden comments include security issues (null refs, auth bypasses) |
| `logic`          | High — most golden comments are logic/correctness bugs                    |
| `error-handling` | Medium — covered in golden comments                                       |
| `performance`    | Low — fewer golden comments about performance                             |
| `api-misuse`     | Medium — import errors, wrong API usage are common golden comments        |

---

## 5. CI Integration

### 5.1 GitHub Actions Workflow

```yaml
name: Benchmark Evaluation
on:
  workflow_dispatch:
    inputs:
      judge_model:
        description: 'LLM judge model'
        default: 'openai/gpt-4o-mini'
        type: string
  schedule:
    # Run weekly on Sundays at 2am UTC
    - cron: '0 2 * * 0'

permissions:
  contents: read
  pull-requests: read

jobs:
  benchmark:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install and build
        run: pnpm install --frozen-lockfile && pnpm build

      - name: Install Python and uv
        uses: astral-sh/setup-uv@v4

      - name: Clone benchmark
        run: |
          git clone https://github.com/withmartian/code-review-benchmark.git /tmp/benchmark
          cd /tmp/benchmark/offline && uv sync

      - name: Run adapter (generate candidates)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: |
          node scripts/benchmark-adapter.js \
            --golden-dir /tmp/benchmark/offline/golden_comments \
            --output /tmp/benchmark/offline/results/odd-ai-reviewers/candidates.json

      - name: Run LLM judge
        env:
          MARTIAN_API_KEY: ${{ secrets.MARTIAN_API_KEY }}
          MARTIAN_BASE_URL: https://api.withmartian.com/v1
          MARTIAN_MODEL: ${{ inputs.judge_model || 'openai/gpt-4o-mini' }}
        working-directory: /tmp/benchmark/offline
        run: |
          uv run python -m code_review_benchmark.step3_judge_comments \
            --tool odd-ai-reviewers

      - name: Generate summary
        working-directory: /tmp/benchmark/offline
        run: uv run python -m code_review_benchmark.summary_table

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-results-${{ github.sha }}
          path: |
            /tmp/benchmark/offline/results/
            /tmp/benchmark/offline/analysis/

      - name: Comment PR with results (if PR)
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            // Read summary table and post as PR comment
            // Implementation depends on summary_table.py output format
```

### 5.2 Benchmark Regression Guard

Add a CI check that fails if benchmark scores drop below thresholds:

```yaml
- name: Check regression
  run: |
    node scripts/benchmark-check.js \
      --results /tmp/benchmark/offline/results/odd-ai-reviewers/ \
      --min-precision 0.40 \
      --min-recall 0.30 \
      --min-f1 0.35
```

### 5.3 Cost and Rate Considerations

- **50 PRs x 1 review each** = 50 LLM calls for our tool
- **Judge evaluation**: ~50 PRs x N candidates x M golden = potentially thousands of LLM judge calls
- **Estimated cost per run**: $5-15 (our tool) + $2-5 (judge) = ~$10-20 total
- **Recommendation**: Run on `workflow_dispatch` (manual) and weekly schedule, NOT on every PR

---

## 6. Implementation Steps

### Phase 1: Fork Infrastructure + GitHub Bot Setup (1 day)

The benchmark authors describe this as "takes an afternoon." No adapter code is needed — our tool just reviews PRs normally.

1. Create a dedicated GitHub org (e.g., `odd-ai-benchmark`) for forked repos
2. Run `step0_fork_prs.py --org odd-ai-benchmark --name odd-ai-reviewers` to fork all 50 benchmark PRs
3. Configure our GitHub Actions workflow (or a bot account) to trigger on PR open in that org
4. Validate that our tool reviews 2-3 test PRs and leaves standard GitHub review comments
5. Create `scripts/benchmark-check.ts` for regression thresholds (reads judge output, exits non-zero on regression)

**Parallel track** (for local development iteration): Create `scripts/benchmark-adapter.ts`:

- Reads golden comment JSON files to get PR URLs
- Clones each forked repo at the correct base/head
- Runs `ai-review local --format json` against each PR
- Transforms our JSON output into benchmark candidate format
- Writes `candidates.json` for the judge

### Phase 2: Full Benchmark Run + Baseline (1 day)

1. Trigger our tool on all 50 forked PRs (or use local adapter for offline mode)
2. Run benchmark pipeline: `step1_download_prs` -> `step2_extract_comments` -> `step3_judge_comments`
3. Record baseline scores (precision, recall, F1)
4. Identify which golden comments we miss (recall gaps) and which of our findings are FPs (precision gaps)
5. Cross-reference with our internal FP taxonomy (Pattern A-E classification)

### Phase 3: CI Integration (1 day)

1. Add `Dockerfile.benchmark` for reproducible runs
2. Add `.github/workflows/benchmark.yml`
3. Add benchmark secrets to GitHub repo settings
4. Run first CI benchmark and validate artifact upload
5. Add regression guard with baseline thresholds

### Phase 4: Leaderboard Submission (0.5 days)

1. Run the full official benchmark pipeline (step0 through step5) via GitHub bot path
2. Verify results appear in the benchmark dashboard
3. Submit results to withmartian for leaderboard inclusion (if they accept external submissions)

### Phase 5: Continuous Improvement Loop (Ongoing)

1. Use benchmark miss analysis to prioritize FP/FN reduction work
2. Track scores over releases
3. Compare against other tools on the leaderboard
4. Eventually integrate with the online benchmark (requires GitHub App deployment — if our tool is deployed as a GitHub bot on public repos, the online benchmark tracks it automatically)

---

## 7. Current Leaderboard Context

### 7.1 Competitive Landscape

The leaderboard at codereview.withmartian.com benchmarks 11 tools. Based on publicly available information and the benchmark methodology:

- **Code review specialists** (CodeRabbit, Graphite, Greptile, Qodo, Propel, Augment) tend to have higher recall because they are purpose-built for finding code issues
- **General AI assistants** (Claude Code, GitHub Copilot, Cursor Bugbot, Codex, Gemini) tend to have higher precision but lower recall because they are more conservative

### 7.2 Where odd-ai-reviewers Would Likely Rank

Based on our current capabilities:

**Strengths (Precision-favoring)**:

- Multi-agent pipeline with deduplication reduces redundant/low-quality findings
- Safe-source detection (Pattern A) filters false positives from hardcoded values
- Framework convention filtering reduces noise on framework-standard patterns
- Post-processing filters self-dismissing phrases

**Weaknesses (Recall-limiting)**:

- TypeScript/JavaScript focused — golden comments span Python, Go, Ruby, Java
- Currently 42 known false positive patterns still being addressed
- Security-focused agents may miss general logic bugs that dominate golden comments
- No language-specific analysis for Go, Ruby, Java

**Estimated Initial Performance**:

- **Precision**: 35-50% (moderate — we filter FPs but still have known gaps)
- **Recall**: 20-35% (limited — multi-language coverage is incomplete)
- **F1**: 25-40%
- **Likely ranking**: Mid-to-lower tier initially, with significant room for improvement on recall

### 7.3 Strategic Alignment

**Key insight**: The benchmark favors tools that produce **specific, actionable comments matching real issues** over high-volume, low-value comments. This aligns perfectly with our FP reduction work — every false positive we eliminate directly improves our precision score, and the benchmark's semantic matching rewards the kind of precise, issue-specific findings our multi-agent pipeline is designed to produce.

### 7.4 Path to Competitive Performance

1. **Short-term** (precision focus): Complete FP reduction work (Pattern A-E fixes), targeting 50%+ precision
2. **Medium-term** (recall focus): Expand language support beyond TypeScript, add logic bug detection agents
3. **Long-term** (both): Fine-tune prompts based on benchmark miss analysis, add specialized agents for common golden comment categories (null refs, import errors, type mismatches)

---

## 8. Relationship to Internal Benchmark

Our existing benchmark infrastructure (`router/tests/fixtures/benchmark/regression-suite.json`) serves a different purpose:

| Aspect           | Internal Benchmark                   | withmartian Benchmark              |
| ---------------- | ------------------------------------ | ---------------------------------- |
| **Purpose**      | FP regression prevention             | Cross-tool comparison              |
| **Dataset**      | 43 synthetic scenarios               | 50 real-world PRs                  |
| **Ground truth** | Expected findings (or lack thereof)  | Human-curated golden comments      |
| **Metrics**      | FP suppression rate, TP preservation | Precision, Recall, F1              |
| **Languages**    | TypeScript only                      | Python, Go, TypeScript, Ruby, Java |
| **When to run**  | Every PR (fast, no LLM calls)        | Weekly/manual (slow, LLM costs)    |

**These are complementary**: The internal benchmark catches regressions quickly. The external benchmark measures absolute quality against the industry.

---

## 9. Risk Assessment

| Risk                                                      | Likelihood | Impact | Mitigation                                                       |
| --------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------- |
| Training data leakage (tools may have seen benchmark PRs) | Medium     | Medium | The benchmark acknowledges this; online benchmark mitigates it   |
| LLM judge variance                                        | Medium     | Low    | Run with multiple judge models; store results per model          |
| Cost overruns from frequent benchmark runs                | Low        | Medium | Schedule weekly + manual trigger only; set budget alerts         |
| Multi-language coverage gaps                              | High       | High   | Prioritize TypeScript/Python PRs initially; expand incrementally |
| Benchmark format changes                                  | Low        | Medium | Pin benchmark repo version; monitor for updates                  |
| Fork org maintenance                                      | Low        | Low    | Forked repos are static; one-time setup                          |
