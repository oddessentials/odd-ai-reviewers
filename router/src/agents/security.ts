/**
 * Agent Security Module
 *
 * Provides security utilities for agent subprocess execution:
 * - Token stripping (Router Monopoly Rule enforcement)
 * - Network listener detection (CVE-2026-22812 mitigation)
 *
 * INVARIANTS ENFORCED:
 * - No Direct Secrets to Agents (Invariant 7)
 * - No Network Listeners in Agent Execution (Invariant 10)
 */

import { execFileSync, execSync } from 'child_process';

export type AgentId =
  | 'semgrep'
  | 'reviewdog'
  | 'opencode'
  | 'pr_agent'
  | 'ai_semantic_review'
  | 'local_llm';

const COMMON_AGENT_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'NO_COLOR',
  'NODE_ENV',
];

const AGENT_ENV_ALLOWLIST: Record<AgentId, string[]> = {
  semgrep: [],
  reviewdog: [],
  opencode: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MODEL'],
  pr_agent: [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT',
    'MODEL',
  ],
  ai_semantic_review: [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT',
    'MODEL',
  ],
  local_llm: [
    'OLLAMA_BASE_URL',
    'OLLAMA_MODEL',
    'LOCAL_LLM_OPTIONAL',
    'LOCAL_LLM_NUM_CTX',
    'LOCAL_LLM_NUM_PREDICT',
    'LOCAL_LLM_TIMEOUT',
  ],
};

const ROUTER_ENV_ALLOWLIST = [
  // GitHub CI context (router-only, NOT passed to agents)
  'GITHUB_TOKEN',
  'GITHUB_ACTOR',
  'GITHUB_HEAD_REPO',
  'GITHUB_REPOSITORY',
  'GITHUB_EVENT_NAME',
  'GITHUB_EVENT_PULL_REQUEST_DRAFT',
  'GITHUB_REF',
  'GITHUB_REF_NAME',
  'GITHUB_BASE_REF',
  'GITHUB_WORKSPACE',
  'GITHUB_ACTIONS',
  // Azure DevOps CI context (router-only, NOT passed to agents)
  'SYSTEM_ACCESSTOKEN', // ADO pipeline token
  'AZURE_DEVOPS_PAT', // PAT fallback for local testing/cross-org
  'SYSTEM_TEAMFOUNDATIONCOLLECTIONURI',
  'SYSTEM_TEAMPROJECT',
  'BUILD_REPOSITORY_URI',
  'BUILD_REPOSITORY_NAME',
  'BUILD_SOURCEVERSION',
  'BUILD_REASON',
  'SYSTEM_PULLREQUEST_PULLREQUESTID',
  'SYSTEM_PULLREQUEST_SOURCEBRANCH',
  'SYSTEM_PULLREQUEST_TARGETBRANCH',
  'SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI',
  'BUILD_REQUESTEDFOR',
  'TF_BUILD',
  // Cross-platform
  'CI',
  // System
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'NODE_ENV',
  // AI Provider Keys (canonical only)
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_DEPLOYMENT',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  // Local LLM tuning
  'LOCAL_LLM_OPTIONAL',
  'LOCAL_LLM_NUM_CTX',
  'LOCAL_LLM_NUM_PREDICT',
  'LOCAL_LLM_TIMEOUT',
  // Model selection (canonical)
  'MODEL',
];

/**
 * List of environment variable patterns that should be stripped from agent subprocesses.
 * These are tokens that would allow agents to post to GitHub/ADO directly.
 */
const TOKEN_PATTERNS = [
  // GitHub tokens
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT',
  'GH_PAT',
  // Azure DevOps tokens
  'AZURE_DEVOPS_PAT',
  'ADO_TOKEN',
  'SYSTEM_ACCESSTOKEN',
  // Generic posting tokens
  'REVIEWDOG_GITHUB_API_TOKEN',
  // Any variable containing TOKEN (case-insensitive)
  /^.*_TOKEN$/i,
  /^.*_PAT$/i,
];

/**
 * Check if an environment variable name matches a token pattern
 */
function isTokenVariable(name: string): boolean {
  return TOKEN_PATTERNS.some((pattern) => {
    if (typeof pattern === 'string') {
      return name === pattern;
    }
    return pattern.test(name);
  });
}

/**
 * Strip all posting tokens from environment variables.
 * Returns a clean environment safe for agent subprocesses.
 *
 * SECURITY: This enforces the Router Monopoly Rule - agents must not have
 * access to tokens that would allow them to post directly to GitHub/ADO.
 */
export function stripTokensFromEnv(
  env: Record<string, string | undefined>
): Record<string, string> {
  const clean: Record<string, string> = {};
  const stripped: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;

    if (isTokenVariable(key)) {
      stripped.push(key);
    } else {
      clean[key] = value;
    }
  }

  if (stripped.length > 0) {
    console.log(
      `[security] Stripped ${stripped.length} tokens from agent environment: ${stripped.join(', ')}`
    );
  }

  return clean;
}

function pickEnv(
  env: Record<string, string | undefined>,
  allowlist: string[]
): Record<string, string | undefined> {
  const picked: Record<string, string | undefined> = {};

  for (const key of allowlist) {
    if (env[key] !== undefined) {
      picked[key] = env[key];
    }
  }

  return picked;
}

export function buildRouterEnv(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  return pickEnv(env, ROUTER_ENV_ALLOWLIST);
}

export function buildAgentEnv(
  agentId: AgentId,
  env: Record<string, string | undefined>
): Record<string, string> {
  const allowlist = new Set([...COMMON_AGENT_ENV_ALLOWLIST, ...AGENT_ENV_ALLOWLIST[agentId]]);
  const picked = pickEnv(env, [...allowlist]);
  return createSafeAgentEnv(picked, Object.keys(picked));
}

export function isKnownAgentId(agentId: string): agentId is AgentId {
  return Object.prototype.hasOwnProperty.call(AGENT_ENV_ALLOWLIST, agentId);
}

/**
 * Check if a specific token exists in the environment.
 * Used for testing that tokens were properly stripped.
 */
export function hasTokenInEnv(env: Record<string, string | undefined>): {
  hasToken: boolean;
  tokens: string[];
} {
  const tokens: string[] = [];

  for (const key of Object.keys(env)) {
    if (env[key] !== undefined && isTokenVariable(key)) {
      tokens.push(key);
    }
  }

  return { hasToken: tokens.length > 0, tokens };
}

/**
 * Validate that no process is listening on network ports.
 * Used to detect if an agent has started an HTTP server (CVE mitigation).
 *
 * @param processName - Optional process name to filter by
 * @returns Object indicating if the check passed and any error message
 */
export async function validateNoListeningSockets(processName?: string): Promise<{
  safe: boolean;
  error?: string;
  listeners?: string[];
}> {
  try {
    try {
      // Use 'which' instead of 'command -v' because command is a shell builtin
      // and execSync doesn't use a shell by default
      execSync('which lsof', { encoding: 'utf-8', stdio: 'ignore', timeout: 2000 });
    } catch {
      return { safe: false, error: 'Listener detection unavailable: lsof not installed' };
    }

    // Use lsof to find listening TCP sockets
    // -i TCP -sTCP:LISTEN shows only listening TCP connections
    // -n -P prevents hostname and port name resolution for speed
    let output = '';
    try {
      output = execFileSync('lsof', ['-i', 'TCP', '-sTCP:LISTEN', '-n', '-P'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'], // ignore stderr
      });
    } catch {
      // lsof returns non-zero if no listeners found, which is fine
      output = '';
    }

    if (!output.trim()) {
      return { safe: true };
    }

    // Parse lsof output
    const lines = output.trim().split('\n');
    const listeners: string[] = [];

    for (const line of lines.slice(1)) {
      // Skip header line
      const parts = line.split(/\s+/);
      const command = parts[0] ?? '';
      const pid = parts[1] ?? '';
      const name = parts[8] ?? '';

      // If processName specified, only flag matching processes
      if (processName && !command.toLowerCase().includes(processName.toLowerCase())) {
        continue;
      }

      listeners.push(`${command}(${pid}) listening on ${name}`);
    }

    if (listeners.length > 0) {
      return {
        safe: false,
        error: `Detected ${listeners.length} listening socket(s): ${listeners.join('; ')}`,
        listeners,
      };
    }

    return { safe: true };
  } catch (error) {
    return {
      safe: false,
      error: `Listener detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Create a sanitized subprocess environment.
 * Removes tokens and sets security-hardening variables.
 */
export function createSafeAgentEnv(
  baseEnv: Record<string, string | undefined>,
  allowedKeys?: string[]
): Record<string, string> {
  // Start with stripped environment
  const clean = stripTokensFromEnv(baseEnv);

  // Add security-hardening defaults
  const safeEnv: Record<string, string> = {
    // Preserve PATH for subprocess execution
    PATH: clean['PATH'] ?? '/usr/local/bin:/usr/bin:/bin',
    // Preserve locale settings
    LANG: clean['LANG'] ?? 'en_US.UTF-8',
    LC_ALL: clean['LC_ALL'] ?? 'en_US.UTF-8',
    // Disable color output for consistent parsing
    NO_COLOR: '1',
    // PEP 540 UTF-8 Mode: Forces Python to use UTF-8 for all I/O, preventing
    // Windows cp1252 encoding crashes in Python-based tools (Semgrep, etc.).
    // Harmless no-op for non-Python subprocesses - the env var is simply ignored.
    // We intentionally override any user-provided value as a safety invariant.
    // See: https://peps.python.org/pep-0540/
    PYTHONUTF8: '1',
    // Set HOME for tools that need it
    HOME: clean['HOME'] ?? '/tmp',
    // Preserve TERM for proper output handling
    TERM: clean['TERM'] ?? 'dumb',
  };

  // Add allowed keys from original environment
  if (allowedKeys) {
    for (const key of allowedKeys) {
      if (clean[key] !== undefined) {
        safeEnv[key] = clean[key];
      }
    }
  }

  return safeEnv;
}
