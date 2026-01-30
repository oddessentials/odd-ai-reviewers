/**
 * Agent Icons Module
 *
 * Centralized mapping of agent IDs to their display icons.
 * Each agent is represented by a unicode icon for visual identification
 * in code review comments and summaries.
 *
 * Agents:
 * - 🧠 Ollama (local_llm) — The Local AI Engine
 * - 🧑‍💻 OpenCode (opencode) — The AI Coding Assistant
 * - 🐺 PR Agent (pr_agent) — The Code Review Commander
 * - 🦊 Review Dog (reviewdog) — The Linter Liaison
 * - 🛡 Semgrep (semgrep) — The Security Sentinel
 * - 🔬 AI Semantic Review (ai_semantic_review) — The Semantic Analyzer
 * - 🔀 Control Flow (control_flow) — The Flow Inspector
 */

/**
 * Agent ID to icon mapping
 *
 * To add a new agent icon:
 * 1. Add the agent ID and icon to this mapping
 * 2. Update the module documentation above
 *
 * If an agent is not in this mapping, the fallback icon (🤖) will be used.
 */
export const AGENT_ICONS: Record<string, string> = {
  local_llm: '🧠', // Ollama — The Local AI Engine
  opencode: '🧑‍💻', // OpenCode — The AI Coding Assistant
  pr_agent: '🐺', // PR Agent — The Code Review Commander
  reviewdog: '🦊', // Review Dog — The Linter Liaison
  semgrep: '🛡', // Semgrep — The Security Sentinel
  ai_semantic_review: '🔬', // AI Semantic Review — The Semantic Analyzer
  control_flow: '🔀', // Control Flow — The Flow Inspector
};

/** Default icon for unknown agents */
export const DEFAULT_AGENT_ICON = '🤖';

/**
 * Get the display icon for an agent
 *
 * @param agentId The agent identifier (e.g., 'semgrep', 'opencode')
 * @returns The unicode icon for the agent, or the default icon if unknown
 */
export function getAgentIcon(agentId: string): string {
  return AGENT_ICONS[agentId] ?? DEFAULT_AGENT_ICON;
}

/**
 * Get the icon with agent ID tooltip hint for accessibility
 *
 * Returns format: "icon" which can be used in markdown/HTML contexts.
 * The agent ID is preserved in fingerprint markers for programmatic identification.
 *
 * @param agentId The agent identifier
 * @returns The display icon
 */
export function getAgentDisplayIcon(agentId: string): string {
  return getAgentIcon(agentId);
}
