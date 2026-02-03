/**
 * Centralized dependency catalog for external tools.
 * Single source of truth for all dependency metadata.
 * @module cli/dependencies/catalog
 */

import type { AgentDependencyMap, DependencyCatalog } from './types.js';

/**
 * Registry of all known external dependencies.
 * Contains metadata for version checking and installation guidance.
 */
export const DEPENDENCY_CATALOG: DependencyCatalog = {
  semgrep: {
    name: 'semgrep',
    displayName: 'Semgrep',
    versionCommand: ['semgrep', ['--version']],
    versionRegex: /(\d+)\.(\d+)\.(\d+)/,
    minVersion: '1.0.0',
    docsUrl: 'https://semgrep.dev/docs/getting-started/',
    installInstructions: {
      darwin: 'brew install semgrep',
      win32: 'pip install semgrep\n\nNote: Requires Python 3.8 or later',
      linux: 'pip install semgrep',
    },
  },
  reviewdog: {
    name: 'reviewdog',
    displayName: 'Reviewdog',
    versionCommand: ['reviewdog', ['--version']],
    versionRegex: /(\d+)\.(\d+)\.(\d+)/,
    minVersion: '0.14.0',
    docsUrl: 'https://github.com/reviewdog/reviewdog#installation',
    installInstructions: {
      darwin: 'brew install reviewdog/tap/reviewdog',
      win32:
        'Download the latest release from:\nhttps://github.com/reviewdog/reviewdog/releases\n\nExtract and add to your PATH',
      linux:
        'curl -sfL https://raw.githubusercontent.com/reviewdog/reviewdog/master/install.sh | sh -s',
    },
  },
};

/**
 * Mapping from agent IDs to their required external dependencies.
 * Agents not listed or with empty arrays have no external tool requirements.
 */
export const AGENT_DEPENDENCIES: AgentDependencyMap = {
  // Tool-based agents
  semgrep: ['semgrep'],
  reviewdog: ['semgrep', 'reviewdog'],

  // AI-based agents (no external tool dependencies)
  opencode: [],
  pr_agent: [],
  local_llm: [],
  ai_semantic_review: [],
  control_flow: [],
};

/**
 * Gets the list of external dependencies required by a specific agent.
 *
 * @param agentId - The agent identifier
 * @returns Array of dependency names, empty if agent has no external dependencies
 */
export function getDependenciesForAgent(agentId: string): string[] {
  return AGENT_DEPENDENCIES[agentId] ?? [];
}

/**
 * Gets the dependency info from the catalog.
 *
 * @param name - Dependency name (e.g., 'semgrep')
 * @returns Dependency info or undefined if not in catalog
 */
export function getDependencyInfo(name: string) {
  return DEPENDENCY_CATALOG[name];
}

/**
 * Gets all known dependency names from the catalog.
 *
 * @returns Array of dependency names
 */
export function getAllDependencyNames(): string[] {
  return Object.keys(DEPENDENCY_CATALOG);
}

/**
 * Checks if an agent requires any external dependencies.
 *
 * @param agentId - The agent identifier
 * @returns true if the agent requires external tools
 */
export function agentRequiresExternalDeps(agentId: string): boolean {
  const deps = AGENT_DEPENDENCIES[agentId];
  return deps !== undefined && deps.length > 0;
}
