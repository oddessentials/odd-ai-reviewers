#!/usr/bin/env node
/**
 * AI Review Router - Main Entry Point
 * Orchestrates multi-pass AI code review
 */

import { Command } from 'commander';
import { loadConfig, getEnabledAgents } from './config.js';
import { checkTrust, type PullRequestContext } from './trust.js';
import { checkBudget, estimateTokens, type BudgetContext } from './budget.js';
import { getDiff, filterFiles, buildCombinedDiff } from './diff.js';
import { getAgentsByIds, type AgentContext, type AgentResult, type Finding } from './agents/index.js';
import { reportToGitHub, type GitHubContext } from './report/github.js';
import { deduplicateFindings, sortFindings, generateSummaryMarkdown } from './report/formats.js';

const program = new Command();

program
    .name('ai-review')
    .description('AI Code Review Router')
    .version('1.0.0');

program
    .command('review')
    .description('Run AI review on a PR or commit range')
    .requiredOption('--repo <path>', 'Path to repository')
    .requiredOption('--base <sha>', 'Base commit SHA')
    .requiredOption('--head <sha>', 'Head commit SHA')
    .option('--pr <number>', 'PR number', parseInt)
    .option('--owner <owner>', 'Repository owner (for GitHub API)')
    .option('--repo-name <name>', 'Repository name (for GitHub API)')
    .option('--dry-run', 'Run without posting results')
    .action(async (options) => {
        try {
            await runReview(options);
        } catch (error) {
            console.error('[router] Fatal error:', error);
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('Validate configuration file')
    .requiredOption('--repo <path>', 'Path to repository')
    .action(async (options) => {
        try {
            const config = await loadConfig(options.repo);
            console.log('[validate] Configuration is valid:');
            console.log(JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('[validate] Invalid configuration:', error);
            process.exit(1);
        }
    });

interface ReviewOptions {
    repo: string;
    base: string;
    head: string;
    pr?: number;
    owner?: string;
    repoName?: string;
    dryRun?: boolean;
}

async function runReview(options: ReviewOptions): Promise<void> {
    console.log('[router] Starting AI Review');
    console.log(`[router] Repository: ${options.repo}`);
    console.log(`[router] Diff: ${options.base}...${options.head}`);

    // Load configuration
    const config = await loadConfig(options.repo);
    console.log(`[router] Loaded config with ${config.passes.length} passes`);

    // Build PR context for trust check
    const prContext: PullRequestContext = {
        number: options.pr ?? 0,
        headRepo: options.owner && options.repoName ? `${options.owner}/${options.repoName}` : '',
        baseRepo: options.owner && options.repoName ? `${options.owner}/${options.repoName}` : '',
        author: process.env['GITHUB_ACTOR'] ?? 'unknown',
        isFork: process.env['GITHUB_HEAD_REPO'] !== process.env['GITHUB_REPOSITORY'],
        isDraft: process.env['GITHUB_EVENT_NAME'] === 'pull_request' &&
            process.env['GITHUB_EVENT_PULL_REQUEST_DRAFT'] === 'true',
    };

    // Check trust
    const trustResult = checkTrust(prContext, config);
    if (!trustResult.trusted) {
        console.log(`[router] Skipping review: ${trustResult.reason}`);
        return;
    }

    // Get diff
    console.log('[router] Extracting diff...');
    const diff = getDiff(options.repo, options.base, options.head);
    console.log(`[router] Found ${diff.files.length} changed files (${diff.totalAdditions}+ / ${diff.totalDeletions}-)`);

    // Filter files
    const filteredFiles = filterFiles(diff.files, config.path_filters);
    console.log(`[router] ${filteredFiles.length} files after filtering`);

    if (filteredFiles.length === 0) {
        console.log('[router] No files to review after filtering');
        return;
    }

    // Build combined diff for LLM context
    const diffContent = buildCombinedDiff(filteredFiles, config.limits.max_diff_lines);
    const estimatedTokenCount = estimateTokens(diffContent);

    // Check budget
    const budgetContext: BudgetContext = {
        fileCount: filteredFiles.length,
        diffLines: diff.totalAdditions + diff.totalDeletions,
        estimatedTokens: estimatedTokenCount,
    };

    const budgetCheck = checkBudget(budgetContext, config.limits);
    if (!budgetCheck.allowed) {
        console.warn(`[router] Budget exceeded: ${budgetCheck.reason}`);
        // Continue with static analysis only
    }

    // Build agent context
    const agentContext: AgentContext = {
        repoPath: options.repo,
        diff,
        files: filteredFiles,
        config,
        diffContent,
        prNumber: options.pr,
        env: process.env as Record<string, string | undefined>,
    };

    // Run passes
    const allFindings: Finding[] = [];
    const allResults: AgentResult[] = [];

    for (const pass of config.passes) {
        if (!pass.enabled) {
            console.log(`[router] Skipping disabled pass: ${pass.name}`);
            continue;
        }

        console.log(`[router] Running pass: ${pass.name}`);
        const agents = getAgentsByIds(pass.agents);

        // Check if this pass uses LLM and we're over budget
        const usesLlm = agents.some((a) => a.usesLlm);
        if (usesLlm && !budgetCheck.allowed) {
            console.log(`[router] Skipping LLM pass due to budget: ${pass.name}`);
            continue;
        }

        for (const agent of agents) {
            console.log(`[router] Running agent: ${agent.name} (${agent.id})`);

            try {
                const result = await agent.run(agentContext);
                allResults.push(result);

                if (result.success) {
                    console.log(`[router] ${agent.name}: ${result.findings.length} findings in ${result.metrics.durationMs}ms`);
                    allFindings.push(...result.findings);
                } else {
                    console.error(`[router] ${agent.name} failed: ${result.error}`);
                }
            } catch (error) {
                console.error(`[router] ${agent.name} crashed:`, error);
            }
        }
    }

    // Process findings
    const deduplicated = deduplicateFindings(allFindings);
    const sorted = sortFindings(deduplicated);

    console.log(`[router] Total findings: ${sorted.length} (deduplicated from ${allFindings.length})`);

    // Generate summary
    const summary = generateSummaryMarkdown(sorted);
    console.log('\n' + summary);

    // Report to GitHub (unless dry run)
    if (!options.dryRun && options.owner && options.repoName && process.env['GITHUB_TOKEN']) {
        const githubContext: GitHubContext = {
            owner: options.owner,
            repo: options.repoName,
            prNumber: options.pr,
            headSha: options.head,
            token: process.env['GITHUB_TOKEN'],
        };

        console.log('[router] Reporting to GitHub...');
        const reportResult = await reportToGitHub(sorted, githubContext, config);

        if (reportResult.success) {
            console.log('[router] Successfully reported to GitHub');
        } else {
            console.error('[router] Failed to report to GitHub:', reportResult.error);
        }
    } else if (options.dryRun) {
        console.log('[router] Dry run - skipping GitHub reporting');
    }

    // Check gating
    if (config.gating.enabled) {
        const hasBlockingFindings = sorted.some((f) => {
            if (config.gating.fail_on_severity === 'error') return f.severity === 'error';
            if (config.gating.fail_on_severity === 'warning') return f.severity === 'error' || f.severity === 'warning';
            return true;
        });

        if (hasBlockingFindings) {
            console.error('[router] Gating failed - blocking severity findings present');
            process.exit(1);
        }
    }

    console.log('[router] Review complete');
}

program.parse();
