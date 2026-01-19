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

import { execSync } from 'child_process';

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
    // Use lsof to find listening TCP sockets
    // -i TCP -sTCP:LISTEN shows only listening TCP connections
    // -n -P prevents hostname and port name resolution for speed
    const cmd = 'lsof -i TCP -sTCP:LISTEN -n -P 2>/dev/null || true';

    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

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
    // If lsof fails (not installed, etc.), log warning but don't fail
    // This allows the system to work in environments without lsof
    console.warn(
      `[security] Could not check for listening sockets: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return { safe: true };
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
