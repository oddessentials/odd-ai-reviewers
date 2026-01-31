/**
 * Config Wizard Module
 *
 * User Story 3: Guided Configuration Mode (P2)
 * Generates valid .ai-review.yml from user options.
 *
 * Features:
 * - TTY check for interactive mode (T033)
 * - Platform prompt handling (T034)
 * - Provider prompt with Azure 3-value handling (T035)
 * - Agent selection (T036)
 * - Deterministic YAML generation with stable key ordering (T037)
 */

import { stringify } from 'yaml';
import type { Config, AgentId, Provider } from '../config/schemas.js';

/**
 * Options for the config wizard.
 */
export interface WizardOptions {
  /** LLM provider selection */
  provider: Provider;
  /** Platform: 'github', 'ado', or 'both' */
  platform: 'github' | 'ado' | 'both';
  /** Selected agents */
  agents: AgentId[];
  /** Use defaults without prompts */
  useDefaults: boolean;
}

/**
 * Check if running in an interactive terminal (TTY).
 * Used to refuse interactive mode in non-TTY environments (T033).
 *
 * @returns true if stdin is a TTY
 */
export function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Generate a default configuration object based on wizard options.
 *
 * @param provider - Selected LLM provider
 * @param platform - Target platform (github, ado, or both)
 * @param agents - Selected agents
 * @returns Partial Config object ready for YAML generation
 */
export function generateDefaultConfig(
  provider: Provider,
  platform: 'github' | 'ado' | 'both',
  agents: AgentId[]
): Config {
  // Separate static analysis agents from AI agents
  // T044: Sort agents alphabetically for byte-stable YAML output
  const staticAgents = agents
    .filter((a) => a === 'semgrep' || a === 'reviewdog')
    .sort() as AgentId[];
  const aiAgents = agents
    .filter((a) => a !== 'semgrep' && a !== 'reviewdog' && a !== 'control_flow')
    .sort() as AgentId[];

  // Build passes array
  const passes: Config['passes'] = [];

  // Static analysis pass (always first, always required)
  if (staticAgents.length > 0) {
    passes.push({
      name: 'static',
      agents: staticAgents,
      enabled: true,
      required: true,
    });
  }

  // AI analysis pass (optional)
  if (aiAgents.length > 0) {
    passes.push({
      name: 'ai',
      agents: aiAgents,
      enabled: true,
      required: false,
    });
  }

  // Default to static-only if no agents selected
  if (passes.length === 0) {
    passes.push({
      name: 'static',
      agents: ['semgrep'],
      enabled: true,
      required: true,
    });
  }

  // Build reporting config based on platform
  // T039 (FR-011, FR-012): Generate dual reporting blocks for "both" platform
  let reporting: Config['reporting'];
  if (platform === 'both') {
    // Both platforms: include GitHub and ADO with sensible defaults
    reporting = {
      github: {
        mode: 'checks_and_comments',
        max_inline_comments: 20,
        summary: true,
      },
      ado: {
        mode: 'threads_and_status',
        max_inline_comments: 20,
        summary: true,
        thread_status: 'active',
      },
    };
  } else if (platform === 'github') {
    reporting = {
      github: {
        mode: 'checks_and_comments',
        max_inline_comments: 20,
        summary: true,
      },
    };
  } else {
    reporting = {
      ado: {
        mode: 'threads_and_status',
        max_inline_comments: 20,
        summary: true,
        thread_status: 'active',
      },
    };
  }

  return {
    version: 1,
    provider,
    trusted_only: true,
    triggers: {
      on: ['pull_request'],
      branches: ['main'],
    },
    passes,
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
    },
    models: {},
    reporting,
    gating: {
      enabled: false,
      fail_on_severity: 'error',
    },
  };
}

/**
 * Generate YAML string from wizard options with deterministic key ordering (T037).
 *
 * Key order:
 * 1. version
 * 2. provider
 * 3. trusted_only
 * 4. triggers
 * 5. passes
 * 6. limits
 * 7. models
 * 8. reporting
 * 9. gating
 *
 * @param options - Wizard configuration options
 * @returns YAML string with deterministic key ordering
 */
export function generateConfigYaml(options: WizardOptions): string {
  const config = generateDefaultConfig(options.provider, options.platform, options.agents);

  // Create ordered config object for deterministic output
  const orderedConfig: Record<string, unknown> = {};

  // Enforce key ordering using bracket notation for TypeScript compliance
  orderedConfig['version'] = config.version;
  orderedConfig['provider'] = config.provider;
  orderedConfig['trusted_only'] = config.trusted_only;
  orderedConfig['triggers'] = config.triggers;
  orderedConfig['passes'] = config.passes;
  orderedConfig['limits'] = config.limits;
  orderedConfig['models'] = config.models;
  orderedConfig['reporting'] = config.reporting;
  orderedConfig['gating'] = config.gating;

  // Generate header comment
  let yaml = '';
  yaml += '# AI Code Review Configuration\n';
  yaml += '# Generated by ai-review config init\n';
  yaml += `# Provider: ${options.provider}\n`;
  yaml += `# Platform: ${options.platform}\n`;
  yaml += '#\n';

  // Add provider-specific comments
  if (options.provider === 'azure-openai') {
    yaml += '# Azure OpenAI requires these environment variables:\n';
    yaml += '#   AZURE_OPENAI_API_KEY\n';
    yaml += '#   AZURE_OPENAI_ENDPOINT\n';
    yaml += '#   AZURE_OPENAI_DEPLOYMENT\n';
    yaml += '#   MODEL=<your-deployment-name>\n';
    yaml += '#\n';
  } else if (options.provider === 'openai') {
    yaml += '# Required environment variable: OPENAI_API_KEY\n';
    yaml += '# Default model: gpt-4o (auto-applied if MODEL not set)\n';
    yaml += '#\n';
  } else if (options.provider === 'anthropic') {
    yaml += '# Required environment variable: ANTHROPIC_API_KEY\n';
    yaml += '# Default model: claude-sonnet-4-20250514 (auto-applied if MODEL not set)\n';
    yaml += '#\n';
  } else if (options.provider === 'ollama') {
    yaml += '# Optional: OLLAMA_BASE_URL (defaults to http://ollama-sidecar:11434)\n';
    yaml += '# Default model: codellama:7b (auto-applied if OLLAMA_MODEL not set)\n';
    yaml += '#\n';
  }

  yaml += '\n';

  // Generate YAML with consistent formatting
  yaml += stringify(orderedConfig, {
    indent: 2,
    lineWidth: 120,
    singleQuote: true,
  });

  return yaml;
}

/**
 * Available agents for selection in the wizard.
 */
export const AVAILABLE_AGENTS: { id: AgentId; name: string; description: string }[] = [
  { id: 'semgrep', name: 'Semgrep', description: 'Static analysis (recommended)' },
  { id: 'reviewdog', name: 'Reviewdog', description: 'Linter aggregator' },
  { id: 'opencode', name: 'OpenCode', description: 'AI code review' },
  { id: 'pr_agent', name: 'PR Agent', description: 'AI PR analysis' },
  { id: 'ai_semantic_review', name: 'Semantic Review', description: 'AI semantic analysis' },
  { id: 'local_llm', name: 'Local LLM', description: 'Ollama-based local AI' },
];

/**
 * Available providers for selection.
 */
export const AVAILABLE_PROVIDERS: { id: Provider; name: string; description: string }[] = [
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o, GPT-4o-mini (default: gpt-4o)' },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Sonnet, Claude Opus (default: claude-sonnet-4)',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI (requires deployment name)',
  },
  { id: 'ollama', name: 'Ollama', description: 'Local models (default: codellama:7b)' },
];

/**
 * Available platforms for selection in the wizard.
 * Feature 015: Config Wizard interactive prompts.
 */
export const AVAILABLE_PLATFORMS: {
  id: 'github' | 'ado' | 'both';
  name: string;
  description: string;
}[] = [
  { id: 'github', name: 'GitHub', description: 'GitHub.com or GitHub Enterprise' },
  { id: 'ado', name: 'Azure DevOps', description: 'Azure DevOps Services or Server' },
  { id: 'both', name: 'Both', description: 'Support both GitHub and Azure DevOps' },
];
