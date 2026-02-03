/**
 * Progress Indicators Module
 *
 * Provides terminal progress indicators including:
 * - Spinner with customizable frames
 * - Agent status tracking with timing
 * - Unicode and ASCII fallback support
 */

import { ANSI, colorize, type Severity } from './colors.js';

// =============================================================================
// Spinner Configuration
// =============================================================================

/**
 * Unicode spinner frames (smooth animation)
 */
export const UNICODE_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * ASCII spinner frames (fallback for limited terminals)
 */
export const ASCII_SPINNER_FRAMES = ['|', '/', '-', '\\'] as const;

/**
 * Status indicators
 */
export const STATUS_INDICATORS = {
  pending: '○',
  running: '◐',
  success: '✓',
  failure: '✗',
  skipped: '⊘',
} as const;

/**
 * ASCII fallback status indicators
 */
export const ASCII_STATUS_INDICATORS = {
  pending: 'o',
  running: '*',
  success: '+',
  failure: 'x',
  skipped: '-',
} as const;

export type SpinnerStatus = keyof typeof STATUS_INDICATORS;

// =============================================================================
// Spinner Class
// =============================================================================

/**
 * Configuration for Spinner
 */
export interface SpinnerOptions {
  /** Spinner frame interval in milliseconds */
  interval?: number;
  /** Use ASCII fallback frames */
  useAscii?: boolean;
  /** Enable colors */
  colored?: boolean;
  /** Output stream (for testing) */
  stream?: NodeJS.WriteStream;
}

/**
 * Terminal spinner for showing progress.
 *
 * Usage:
 * ```typescript
 * const spinner = new Spinner();
 * spinner.start('Loading...');
 * // ... do work ...
 * spinner.stop();
 * ```
 */
export class Spinner {
  private frames: readonly string[];
  private frameIndex = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private interval: number;
  private colored: boolean;
  private stream: NodeJS.WriteStream;
  private text = '';
  private startTime = 0;

  constructor(options: SpinnerOptions = {}) {
    this.frames = options.useAscii ? ASCII_SPINNER_FRAMES : UNICODE_SPINNER_FRAMES;
    this.interval = options.interval ?? 80;
    this.colored = options.colored ?? true;
    this.stream = options.stream ?? process.stderr;
  }

  /**
   * Start the spinner with the given text.
   *
   * @param text - Text to display next to spinner
   */
  start(text: string): void {
    if (this.intervalId) {
      this.stop();
    }

    this.text = text;
    this.startTime = Date.now();
    this.frameIndex = 0;

    // Only animate if stream is a TTY
    if (this.stream.isTTY) {
      this.render();
      this.intervalId = setInterval(() => this.render(), this.interval);
    } else {
      // For non-TTY, just print the text once
      this.stream.write(`${this.getFrame()} ${text}\n`);
    }
  }

  /**
   * Update the spinner text.
   *
   * @param text - New text to display
   */
  update(text: string): void {
    this.text = text;
    if (this.stream.isTTY && this.intervalId) {
      this.render();
    }
  }

  /**
   * Stop the spinner.
   *
   * @param finalText - Optional text to show after stopping
   */
  stop(finalText?: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.stream.isTTY) {
      // Clear the current line
      this.stream.write('\r\x1b[K');

      if (finalText) {
        this.stream.write(`${finalText}\n`);
      }
    }
  }

  /**
   * Stop with success indicator.
   *
   * @param text - Success message
   */
  succeed(text: string): void {
    const indicator = this.colored
      ? colorize(STATUS_INDICATORS.success, ANSI.green, true)
      : STATUS_INDICATORS.success;
    this.stop(`${indicator} ${text}`);
  }

  /**
   * Stop with failure indicator.
   *
   * @param text - Failure message
   */
  fail(text: string): void {
    const indicator = this.colored
      ? colorize(STATUS_INDICATORS.failure, ANSI.red, true)
      : STATUS_INDICATORS.failure;
    this.stop(`${indicator} ${text}`);
  }

  /**
   * Get elapsed time since start.
   *
   * @returns Elapsed time in milliseconds
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get formatted elapsed time.
   *
   * @returns Formatted time string (e.g., "1.2s")
   */
  getFormattedElapsed(): string {
    return formatDuration(this.getElapsed());
  }

  private getFrame(): string {
    const frame = this.frames[this.frameIndex % this.frames.length];
    return this.colored ? colorize(frame ?? '', ANSI.cyan, true) : (frame ?? '');
  }

  private render(): void {
    const elapsed = this.getFormattedElapsed();
    const elapsedStr = this.colored ? colorize(`[${elapsed}]`, ANSI.gray, true) : `[${elapsed}]`;
    const line = `${this.getFrame()} ${this.text}  ${elapsedStr}`;

    this.stream.write(`\r\x1b[K${line}`);
    this.frameIndex++;
  }
}

// =============================================================================
// Agent Progress Tracking
// =============================================================================

/**
 * Agent execution status
 */
export type AgentStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/**
 * Progress entry for a single agent
 */
export interface AgentProgressEntry {
  /** Agent identifier */
  agentId: string;
  /** Human-readable name */
  agentName: string;
  /** Current status */
  status: AgentStatus;
  /** Start timestamp */
  startTime?: number;
  /** End timestamp */
  endTime?: number;
  /** Number of findings produced */
  findingsCount?: number;
  /** Failure/skip reason */
  reason?: string;
}

/**
 * Tracks progress of multiple agents.
 */
export class AgentProgress {
  private agents = new Map<string, AgentProgressEntry>();
  private colored: boolean;
  private useAscii: boolean;

  constructor(options: { colored?: boolean; useAscii?: boolean } = {}) {
    this.colored = options.colored ?? true;
    this.useAscii = options.useAscii ?? false;
  }

  /**
   * Register an agent for tracking.
   *
   * @param agentId - Agent identifier
   * @param agentName - Human-readable name
   */
  addAgent(agentId: string, agentName: string): void {
    this.agents.set(agentId, {
      agentId,
      agentName,
      status: 'pending',
    });
  }

  /**
   * Mark an agent as started.
   *
   * @param agentId - Agent identifier
   */
  startAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'running';
      agent.startTime = Date.now();
    }
  }

  /**
   * Mark an agent as completed.
   *
   * @param agentId - Agent identifier
   * @param findingsCount - Number of findings produced
   */
  completeAgent(agentId: string, findingsCount: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'done';
      agent.endTime = Date.now();
      agent.findingsCount = findingsCount;
    }
  }

  /**
   * Mark an agent as failed.
   *
   * @param agentId - Agent identifier
   * @param reason - Failure reason
   */
  failAgent(agentId: string, reason: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'failed';
      agent.endTime = Date.now();
      agent.reason = reason;
    }
  }

  /**
   * Mark an agent as skipped.
   *
   * @param agentId - Agent identifier
   * @param reason - Skip reason
   */
  skipAgent(agentId: string, reason: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'skipped';
      agent.reason = reason;
    }
  }

  /**
   * Get status for a specific agent.
   *
   * @param agentId - Agent identifier
   * @returns Agent progress entry or undefined
   */
  getAgent(agentId: string): AgentProgressEntry | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agent entries.
   *
   * @returns Array of agent progress entries
   */
  getAllAgents(): AgentProgressEntry[] {
    return Array.from(this.agents.values());
  }

  /**
   * Format agent status for display.
   *
   * @param agentId - Agent identifier
   * @returns Formatted status string
   */
  formatAgentStatus(agentId: string): string {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return '';
    }

    return formatAgentStatusLine(agent, this.colored, this.useAscii);
  }

  /**
   * Get summary of all agent statuses.
   *
   * @returns Object with counts by status
   */
  getSummary(): Record<AgentStatus, number> {
    const summary: Record<AgentStatus, number> = {
      pending: 0,
      running: 0,
      done: 0,
      failed: 0,
      skipped: 0,
    };

    for (const agent of this.agents.values()) {
      summary[agent.status]++;
    }

    return summary;
  }
}

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format a duration in milliseconds to human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.2s", "45ms")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m${seconds}s`;
}

/**
 * Format an agent status line with indicator, timing, and findings count.
 *
 * @param agent - Agent progress entry
 * @param colored - Whether to use colors
 * @param useAscii - Whether to use ASCII fallback characters
 * @returns Formatted status line
 */
export function formatAgentStatusLine(
  agent: AgentProgressEntry,
  colored: boolean,
  useAscii = false
): string {
  const indicators = useAscii ? ASCII_STATUS_INDICATORS : STATUS_INDICATORS;
  let indicator: string;
  let statusColor: string;

  switch (agent.status) {
    case 'pending':
      indicator = indicators.pending;
      statusColor = ANSI.gray;
      break;
    case 'running':
      indicator = indicators.running;
      statusColor = ANSI.cyan;
      break;
    case 'done':
      indicator = indicators.success;
      statusColor = ANSI.green;
      break;
    case 'failed':
      indicator = indicators.failure;
      statusColor = ANSI.red;
      break;
    case 'skipped':
      indicator = indicators.skipped;
      statusColor = ANSI.yellow;
      break;
    default:
      indicator = '?';
      statusColor = '';
  }

  const coloredIndicator = colored ? colorize(indicator, statusColor, true) : indicator;

  // Build the status line
  const parts = [coloredIndicator, agent.agentName];

  // Add timing for completed agents
  if (agent.endTime && agent.startTime) {
    const duration = formatDuration(agent.endTime - agent.startTime);
    const durationStr = colored ? colorize(`[${duration}]`, ANSI.gray, true) : `[${duration}]`;
    parts.push(durationStr);
  }

  // Add findings count for done agents
  if (agent.status === 'done' && agent.findingsCount !== undefined) {
    const countStr =
      agent.findingsCount === 0
        ? 'no findings'
        : `${agent.findingsCount} finding${agent.findingsCount === 1 ? '' : 's'}`;
    parts.push(colored ? colorize(countStr, ANSI.gray, true) : countStr);
  }

  // Add reason for failed/skipped agents
  if ((agent.status === 'failed' || agent.status === 'skipped') && agent.reason) {
    const reasonStr = colored ? colorize(agent.reason, ANSI.gray, true) : agent.reason;
    parts.push(`(${reasonStr})`);
  }

  return parts.join(' ');
}

/**
 * Get severity indicator (emoji or text).
 *
 * @param severity - Finding severity
 * @param useEmoji - Whether to use emoji
 * @returns Severity indicator
 */
export function getSeverityIndicator(severity: Severity, useEmoji = true): string {
  if (useEmoji) {
    switch (severity) {
      case 'error':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'info':
        return '🔵';
      default:
        return '○';
    }
  }

  switch (severity) {
    case 'error':
      return '[E]';
    case 'warning':
      return '[W]';
    case 'info':
      return '[I]';
    default:
      return '[-]';
  }
}
