/**
 * Signal Handling Module
 *
 * Provides graceful shutdown handling for SIGINT (Ctrl+C) and SIGTERM signals.
 * Ensures partial results are reported when execution is interrupted.
 *
 * @module cli/signals
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Cleanup function called during shutdown
 * Returns partial results or void
 */
export type CleanupFunction = () => void | Promise<void>;

/**
 * Shutdown state tracking
 */
export interface ShutdownState {
  /** Whether shutdown has been triggered */
  triggered: boolean;
  /** The signal that triggered shutdown */
  signal?: 'SIGINT' | 'SIGTERM';
  /** Timestamp when shutdown was triggered */
  timestamp?: number;
}

/**
 * Signal handler registration options
 */
export interface SignalHandlerOptions {
  /** Custom cleanup function */
  cleanup?: CleanupFunction;
  /** Whether to show partial results message on SIGINT */
  showPartialResultsMessage?: boolean;
  /** Custom logger for shutdown messages */
  logger?: {
    log: (message: string) => void;
    warn: (message: string) => void;
  };
}

// =============================================================================
// State
// =============================================================================

let shutdownState: ShutdownState = {
  triggered: false,
};

let registeredCleanup: CleanupFunction | undefined;
let registeredOptions: SignalHandlerOptions = {};

// Track registered handlers for cleanup
let sigintHandler: NodeJS.SignalsListener | undefined;
let sigtermHandler: NodeJS.SignalsListener | undefined;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Check if shutdown has been triggered
 *
 * Use this in long-running loops to check if the user has requested shutdown.
 *
 * @returns true if shutdown has been triggered
 */
export function isShutdownTriggered(): boolean {
  return shutdownState.triggered;
}

/**
 * Get the current shutdown state
 *
 * @returns Current shutdown state object
 */
export function getShutdownState(): Readonly<ShutdownState> {
  return { ...shutdownState };
}

/**
 * Reset shutdown state
 *
 * Primarily used for testing. Clears the shutdown state and removes handlers.
 */
export function resetShutdownState(): void {
  shutdownState = { triggered: false };
  removeSignalHandlers();
}

/**
 * Remove registered signal handlers
 *
 * Called during reset or when handlers need to be replaced.
 */
function removeSignalHandlers(): void {
  if (sigintHandler) {
    process.removeListener('SIGINT', sigintHandler);
    sigintHandler = undefined;
  }
  if (sigtermHandler) {
    process.removeListener('SIGTERM', sigtermHandler);
    sigtermHandler = undefined;
  }
  registeredCleanup = undefined;
  registeredOptions = {};
}

/**
 * Create a signal handler for the given signal type
 *
 * @param signal - The signal type
 * @returns Signal handler function
 */
function createSignalHandler(signal: 'SIGINT' | 'SIGTERM'): NodeJS.SignalsListener {
  return async () => {
    const logger = registeredOptions.logger ?? console;

    // Prevent multiple shutdown triggers
    if (shutdownState.triggered) {
      logger.warn('\nForce quit requested. Exiting immediately.');
      process.exit(130); // 128 + 2 (SIGINT)
    }

    // Mark shutdown as triggered
    shutdownState = {
      triggered: true,
      signal,
      timestamp: Date.now(),
    };

    if (signal === 'SIGINT') {
      // User pressed Ctrl+C
      if (registeredOptions.showPartialResultsMessage !== false) {
        logger.log('\n\nReceived interrupt signal. Shutting down gracefully...');
      }
    } else {
      // SIGTERM - typically from process manager
      logger.log('\nReceived termination signal. Shutting down...');
    }

    // Run cleanup if registered
    if (registeredCleanup) {
      try {
        await registeredCleanup();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup error: ${errorMsg}`);
      }
    }

    // Exit with appropriate code
    // 128 + signal number: SIGINT = 2, SIGTERM = 15
    const exitCode = signal === 'SIGINT' ? 130 : 143;
    process.exit(exitCode);
  };
}

/**
 * Setup signal handlers for graceful shutdown
 *
 * Registers handlers for SIGINT (Ctrl+C) and SIGTERM that:
 * 1. Set the shutdown state
 * 2. Call the optional cleanup function
 * 3. Exit with appropriate code (130 for SIGINT, 143 for SIGTERM)
 *
 * On second SIGINT (force quit), exits immediately without cleanup.
 *
 * @param options - Signal handler options
 *
 * @example
 * ```typescript
 * setupSignalHandlers({
 *   cleanup: async () => {
 *     // Report partial results
 *     await reportPartialResults();
 *   },
 *   showPartialResultsMessage: true,
 * });
 * ```
 */
export function setupSignalHandlers(options: SignalHandlerOptions = {}): void {
  // Remove existing handlers first
  removeSignalHandlers();

  // Store options and cleanup function
  registeredCleanup = options.cleanup;
  registeredOptions = options;

  // Reset shutdown state
  shutdownState = { triggered: false };

  // Create and register handlers
  sigintHandler = createSignalHandler('SIGINT');
  sigtermHandler = createSignalHandler('SIGTERM');

  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);
}

/**
 * Legacy function signature for backward compatibility
 *
 * @param cleanup - Cleanup function to call during shutdown
 */
export function setupSignalHandlersLegacy(cleanup: CleanupFunction): void {
  setupSignalHandlers({ cleanup });
}

// =============================================================================
// Partial Results Tracking
// =============================================================================

/**
 * Context for tracking partial results during execution
 */
export interface PartialResultsContext {
  /** Total agents to execute */
  totalAgents: number;
  /** Completed agent count */
  completedAgents: number;
  /** Agent names that completed */
  completedAgentNames: string[];
  /** Current agent being executed (if any) */
  currentAgent?: string;
}

let partialResultsContext: PartialResultsContext | undefined;

/**
 * Set the partial results context for progress tracking
 *
 * Call this when starting agent execution to enable accurate
 * completion percentage in shutdown messages.
 *
 * @param context - Partial results tracking context
 */
export function setPartialResultsContext(context: PartialResultsContext): void {
  partialResultsContext = context;
}

/**
 * Update the partial results context
 *
 * Call this after each agent completes to update progress.
 *
 * @param update - Partial update to apply
 */
export function updatePartialResultsContext(update: Partial<PartialResultsContext>): void {
  if (partialResultsContext) {
    partialResultsContext = { ...partialResultsContext, ...update };
  }
}

/**
 * Get the current partial results context
 *
 * @returns Current context or undefined if not set
 */
export function getPartialResultsContext(): PartialResultsContext | undefined {
  return partialResultsContext ? { ...partialResultsContext } : undefined;
}

/**
 * Clear the partial results context
 *
 * Call this after execution completes normally.
 */
export function clearPartialResultsContext(): void {
  partialResultsContext = undefined;
}

/**
 * Format a shutdown message with partial results information
 *
 * @param context - Partial results context
 * @returns Formatted message lines
 */
export function formatPartialResultsMessage(context: PartialResultsContext): string[] {
  const lines: string[] = [];

  const completionPercent =
    context.totalAgents > 0 ? Math.round((context.completedAgents / context.totalAgents) * 100) : 0;

  lines.push(`📊 SUMMARY [interrupted at ${completionPercent}%]`);
  lines.push('');

  if (context.completedAgentNames.length > 0) {
    const completedList = context.completedAgentNames.map((name) => `${name} ✓`).join(', ');
    lines.push(`Agents: ${context.completedAgents}/${context.totalAgents} completed`);
    lines.push(
      `  (${completedList}${context.currentAgent ? `, ${context.currentAgent} ✗ interrupted` : ''})`
    );
  } else {
    lines.push(`Agents: 0/${context.totalAgents} completed (interrupted before any completed)`);
  }

  return lines;
}
