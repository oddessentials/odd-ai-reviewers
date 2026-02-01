/**
 * Progress Indicators Module
 *
 * Provides spinners and agent status tracking for terminal output.
 *
 * @module cli/output/progress
 */

import { colorize, type AnsiCode } from './colors.js';

// =============================================================================
// Spinner
// =============================================================================

/**
 * Unicode spinner frames
 */
const UNICODE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * ASCII spinner frames (fallback)
 */
const ASCII_FRAMES = ['|', '/', '-', '\\'] as const;

/**
 * Spinner configuration
 */
export interface SpinnerOptions {
  /** Use ASCII characters instead of Unicode */
  readonly ascii?: boolean;
  /** Enable colors */
  readonly colored?: boolean;
  /** Spinner color */
  readonly color?: AnsiCode;
  /** Interval between frames in ms */
  readonly interval?: number;
  /** Stream to write to */
  readonly stream?: NodeJS.WriteStream;
}

/**
 * Terminal spinner for progress indication
 */
export class Spinner {
  private readonly frames: readonly string[];
  private readonly interval: number;
  private readonly colored: boolean;
  private readonly color: AnsiCode;
  private readonly stream: NodeJS.WriteStream;

  private frameIndex = 0;
  private timer: NodeJS.Timeout | null = null;
  private currentText = '';
  private isRunning = false;

  constructor(options: SpinnerOptions = {}) {
    this.frames = options.ascii ? ASCII_FRAMES : UNICODE_FRAMES;
    this.interval = options.interval ?? 80;
    this.colored = options.colored ?? true;
    this.color = options.color ?? 'cyan';
    this.stream = options.stream ?? process.stderr;
  }

  /**
   * Start the spinner with initial text
   */
  start(text: string): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentText = text;
    this.render();
    this.timer = setInterval(() => this.render(), this.interval);
  }

  /**
   * Update the spinner text
   */
  update(text: string): void {
    this.currentText = text;
    if (this.isRunning) {
      this.render();
    }
  }

  /**
   * Stop the spinner and clear the line
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearLine();
  }

  /**
   * Stop the spinner with a success message
   */
  succeed(text: string): void {
    this.stopWithSymbol('✓', 'green', text);
  }

  /**
   * Stop the spinner with a failure message
   */
  fail(text: string): void {
    this.stopWithSymbol('✗', 'red', text);
  }

  /**
   * Stop the spinner with a warning message
   */
  warn(text: string): void {
    this.stopWithSymbol('⚠', 'yellow', text);
  }

  /**
   * Stop the spinner with an info message
   */
  info(text: string): void {
    this.stopWithSymbol('ℹ', 'blue', text);
  }

  private stopWithSymbol(symbol: string, symbolColor: AnsiCode, text: string): void {
    this.stop();
    const coloredSymbol = colorize(symbol, symbolColor, this.colored);
    this.stream.write(`${coloredSymbol} ${text}\n`);
  }

  private render(): void {
    // frameIndex is always within bounds due to modulo operation
    const frame = this.frames[this.frameIndex] ?? this.frames[0] ?? '|';
    const coloredFrame = colorize(frame, this.color, this.colored);
    this.clearLine();
    this.stream.write(`${coloredFrame} ${this.currentText}`);
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
  }

  private clearLine(): void {
    // Move cursor to beginning and clear line
    this.stream.write('\r\x1b[K');
  }
}

// =============================================================================
// Agent Progress
// =============================================================================

/**
 * Agent execution status
 */
export type AgentStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped' | 'interrupted';

/**
 * Agent progress entry
 */
export interface AgentProgress {
  readonly agentId: string;
  readonly agentName: string;
  status: AgentStatus;
  startTime?: number;
  endTime?: number;
  findingsCount?: number;
  reason?: string;
}

/**
 * Format agent status for display
 */
export function formatAgentStatus(agent: AgentProgress, colored: boolean): string {
  const { agentName, status, startTime, endTime, findingsCount, reason } = agent;

  let statusSymbol: string;
  let statusColor: AnsiCode;

  switch (status) {
    case 'pending':
      statusSymbol = '○';
      statusColor = 'gray';
      break;
    case 'running':
      statusSymbol = '◐';
      statusColor = 'cyan';
      break;
    case 'success':
      statusSymbol = '✓';
      statusColor = 'green';
      break;
    case 'failure':
      statusSymbol = '✗';
      statusColor = 'red';
      break;
    case 'skipped':
      statusSymbol = '⊘';
      statusColor = 'gray';
      break;
    case 'interrupted':
      statusSymbol = '⚡';
      statusColor = 'yellow';
      break;
  }

  const coloredSymbol = colorize(statusSymbol, statusColor, colored);
  let line = `${coloredSymbol} ${agentName}`;

  // Add timing if available
  if (startTime && endTime) {
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    line += colorize(` [${duration}s]`, 'gray', colored);
  } else if (startTime && status === 'running') {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    line += colorize(` [${elapsed}s]`, 'gray', colored);
  }

  // Add findings count for completed agents
  if (status === 'success' && findingsCount !== undefined) {
    line += `: ${findingsCount} finding${findingsCount === 1 ? '' : 's'}`;
  }

  // Add reason for failures/skips
  if ((status === 'failure' || status === 'skipped') && reason) {
    line += colorize(` (${reason})`, 'gray', colored);
  }

  return line;
}

/**
 * Progress tracker for multiple agents
 */
export class AgentProgressTracker {
  private readonly agents = new Map<string, AgentProgress>();
  private readonly colored: boolean;
  private readonly stream: NodeJS.WriteStream;

  constructor(options: { colored?: boolean; stream?: NodeJS.WriteStream } = {}) {
    this.colored = options.colored ?? true;
    this.stream = options.stream ?? process.stderr;
  }

  /**
   * Register an agent for tracking
   */
  register(agentId: string, agentName: string): void {
    this.agents.set(agentId, {
      agentId,
      agentName,
      status: 'pending',
    });
  }

  /**
   * Mark agent as running
   */
  start(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'running';
      agent.startTime = Date.now();
    }
  }

  /**
   * Mark agent as completed
   */
  complete(agentId: string, findingsCount: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'success';
      agent.endTime = Date.now();
      agent.findingsCount = findingsCount;
    }
  }

  /**
   * Mark agent as failed
   */
  fail(agentId: string, reason: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'failure';
      agent.endTime = Date.now();
      agent.reason = reason;
    }
  }

  /**
   * Mark agent as skipped
   */
  skip(agentId: string, reason: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'skipped';
      agent.reason = reason;
    }
  }

  /**
   * Mark agent as interrupted
   */
  interrupt(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'running') {
      agent.status = 'interrupted';
      agent.endTime = Date.now();
    }
  }

  /**
   * Get all agents
   */
  getAll(): AgentProgress[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get completion percentage
   */
  getCompletionPercentage(): number {
    const total = this.agents.size;
    if (total === 0) return 100;

    const completed = Array.from(this.agents.values()).filter(
      (a) => a.status === 'success' || a.status === 'failure' || a.status === 'skipped'
    ).length;

    return Math.round((completed / total) * 100);
  }

  /**
   * Print all agent statuses
   */
  printSummary(): void {
    for (const agent of this.agents.values()) {
      this.stream.write(formatAgentStatus(agent, this.colored) + '\n');
    }
  }
}
