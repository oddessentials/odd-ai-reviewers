# Worker Thread Timeout Design

**Status**: Design Document (No Implementation)
**Feature**: 007-pnpm-timeout-telemetry
**Date**: 2026-01-28

## Overview

This document describes the design for preemptive timeout handling using Node.js Worker threads. This is a **design-only document**—implementation is deferred to a future feature cycle.

The current timeout mechanism in odd-ai-reviewers uses cooperative timeouts, which cannot interrupt a running synchronous operation (e.g., a regex stuck in catastrophic backtracking). Worker threads provide true preemptive cancellation via `worker.terminate()`.

## Current State

### Cooperative Timeout Limitations

The current `TimeoutRegex` class in `router/src/agents/control_flow/timeout-regex.ts` uses a post-hoc timeout check:

```typescript
// Current: Cooperative timeout (post-hoc detection)
const startTime = process.hrtime.bigint();
const matched = this.pattern.test(input); // Cannot be interrupted!
const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
const timedOut = elapsedMs > this.timeoutMs;
```

**Problem**: If the regex takes 30 seconds due to catastrophic backtracking, we can only detect this _after_ it completes. The main thread is blocked for the entire duration.

### Affected Operations

| Operation                | Current Timeout      | Preemptive Needed?    |
| ------------------------ | -------------------- | --------------------- |
| Regex pattern evaluation | 100ms cooperative    | Yes - CPU-bound       |
| LocalLLM (Ollama)        | 600s AbortController | No - I/O-bound        |
| Semgrep subprocess       | 300s child_process   | No - separate process |
| Reviewdog subprocess     | 300s child_process   | No - separate process |

## Worker Thread Model

### Architecture

```
Main Thread                    Worker Thread
     │                              │
     ├── postMessage(task) ────────►│
     │                              ├── Execute CPU-bound work
     │                              │
     ├── setTimeout(terminate) ─────┤
     │                              │
     │◄───── postMessage(result) ───┤
     │                              │
     └── clearTimeout() ────────────┘
```

### Isolation Model

Worker threads in Node.js provide:

1. **Separate V8 Isolate**: Completely isolated JavaScript context
2. **Own Event Loop**: Independent of main thread
3. **No Shared Memory**: Data must be serialized (except SharedArrayBuffer)
4. **Preemptive Termination**: `worker.terminate()` kills the thread immediately

### Message Protocol

```typescript
// Main thread → Worker
interface WorkerTask {
  taskId: string;
  type: 'regex_test' | 'regex_exec';
  payload: {
    pattern: string;
    flags: string;
    input: string;
  };
}

// Worker → Main thread
interface WorkerResult {
  taskId: string;
  success: boolean;
  result?: PatternEvaluationResult;
  error?: string;
}
```

### Cancellation Semantics

```typescript
// Preemptive timeout with worker.terminate()
async function executeWithTimeout<T>(
  workerPath: string,
  task: WorkerTask,
  timeoutMs: number
): Promise<T> {
  const worker = new Worker(workerPath);

  const timeoutId = setTimeout(() => {
    worker.terminate(); // Kills thread immediately
  }, timeoutMs);

  return new Promise((resolve, reject) => {
    worker.on('message', (result) => {
      clearTimeout(timeoutId);
      worker.terminate();
      resolve(result);
    });

    worker.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });

    worker.postMessage(task);
  });
}
```

## Resource Cleanup

### What `worker.terminate()` Does

1. Sends SIGKILL-like signal to worker thread
2. Immediately stops execution (no graceful shutdown)
3. Frees V8 isolate memory
4. Closes all worker resources (file handles, sockets)

### What It Does NOT Do

1. Run `finally` blocks in the worker
2. Execute `process.on('exit')` handlers
3. Clean up external resources (database connections, file locks)

### Mitigation

For operations that require cleanup:

- Do cleanup in main thread after termination
- Use resource pools that can detect orphaned resources
- Avoid long-lived resources in worker threads

## Performance Characteristics

### Overhead

| Metric                | Value    | Notes                    |
| --------------------- | -------- | ------------------------ |
| Worker startup        | ~50ms    | Cold start, first import |
| Worker startup (warm) | ~10ms    | If Worker code is cached |
| Memory per worker     | ~10MB    | Separate V8 isolate      |
| Serialization         | Variable | Depends on data size     |
| postMessage latency   | ~0.1ms   | Small messages           |

### When Workers Add Value

Workers are beneficial when:

- **Operation time > 100ms**: Startup overhead is amortized
- **CPU-bound work**: Main thread stays responsive
- **True timeout needed**: Operation must be killable

### When Workers Are Wasteful

Workers are **not** recommended when:

- **Operation time < 1 second**: Startup overhead exceeds benefit
- **I/O-bound work**: Use `AbortController` instead
- **Shared state required**: Serialization overhead too high
- **Startup > operation**: Short regex patterns don't benefit

## Migration Criteria

### Prerequisites for Worker Migration

A timeout operation should be migrated to Workers when:

1. **CPU-bound**: Operation blocks the event loop
2. **Long-running**: Typically > 1 second worst case
3. **Unpredictable**: Cannot guarantee completion time
4. **No side effects**: Worker termination is safe

### Decision Matrix

```
                        CPU-Bound?
                    Yes          No
                ┌──────────┬──────────┐
 Long-running?  │  WORKER  │  ABORT   │
      Yes       │ (regex)  │ (fetch)  │
                ├──────────┼──────────┤
      No        │   NO*    │   NO     │
                │ (*inline)│ (inline) │
                └──────────┴──────────┘
```

## Anti-Patterns

### DO NOT Use Workers For

1. **Quick operations (< 1 second)**

   ```typescript
   // BAD: Worker overhead exceeds benefit
   const result = await workerExecute('simple regex', input);

   // GOOD: Direct execution
   const result = /simple/.test(input);
   ```

2. **I/O-bound operations**

   ```typescript
   // BAD: fetch is already async
   const result = await workerExecute('fetch', url);

   // GOOD: Use AbortController
   const controller = new AbortController();
   setTimeout(() => controller.abort(), 5000);
   const result = await fetch(url, { signal: controller.signal });
   ```

3. **Operations requiring shared mutable state**

   ```typescript
   // BAD: Shared state requires complex coordination
   let counter = 0;
   await workerExecute(() => counter++); // Worker has own copy!

   // GOOD: Use Atomics with SharedArrayBuffer (complex)
   // or pass data back and forth (simpler)
   ```

4. **Startup overhead > operation time**

   ```typescript
   // BAD: 50ms worker startup for 1ms regex
   for (const input of inputs) {
     await workerExecute(pattern, input); // 50ms per iteration!
   }

   // GOOD: Batch in single worker
   const results = await workerExecuteBatch(pattern, inputs);
   ```

## Future Implementation Considerations

### Worker Pool

For high-throughput scenarios, maintain a pool of warm workers:

```typescript
interface WorkerPool {
  acquire(): Promise<Worker>;
  release(worker: Worker): void;
  terminate(): Promise<void>;
}
```

### Telemetry Integration

Worker timeouts should emit telemetry events:

```typescript
if (timedOut) {
  emitTimeoutEvent({
    operation_id: `worker_${taskId}`,
    duration_ms: elapsedMs,
    threshold_ms: timeoutMs,
    severity: 'error',
    allowed_context: {
      worker_type: 'regex',
      pattern_hash: hashPattern(pattern),
    },
  });
}
```

### Graceful Degradation

If worker fails to start, fall back to cooperative timeout:

```typescript
try {
  return await workerExecute(pattern, input, timeoutMs);
} catch (workerError) {
  console.warn('[worker] Falling back to cooperative timeout');
  return cooperativeExecute(pattern, input, timeoutMs);
}
```

## References

- [Node.js Worker Threads Documentation](https://nodejs.org/api/worker_threads.html)
- [V8 Isolates](https://v8.dev/docs/embed#isolates)
- [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)

## Appendix: Code Examples

### Minimal Worker Example

**worker.js**:

```javascript
const { parentPort } = require('worker_threads');

parentPort.on('message', (task) => {
  const { pattern, flags, input } = task.payload;
  const regex = new RegExp(pattern, flags);
  const result = regex.test(input);
  parentPort.postMessage({ success: true, result });
});
```

**main.js**:

```javascript
const { Worker } = require('worker_threads');

const worker = new Worker('./worker.js');
const timeout = setTimeout(() => worker.terminate(), 100);

worker.on('message', (result) => {
  clearTimeout(timeout);
  console.log('Result:', result);
  worker.terminate();
});

worker.postMessage({
  payload: { pattern: '.*', flags: '', input: 'test' },
});
```
