/**
 * Unit tests for telemetry type schemas
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Tests: T020, T021
 */

import { describe, it, expect } from 'vitest';
import {
  TimeoutEventSchema,
  TelemetryConfigSchema,
  TimeoutSeverity,
  TelemetryBackendType,
  TelemetryVerbosity,
  OperationId,
  AllowedContextSchema,
  createTimeoutEvent,
  DEFAULT_TELEMETRY_CONFIG,
} from '../../../src/telemetry/types.js';

describe('TimeoutEventSchema', () => {
  const validEvent = {
    operation_id: 'local_llm_req123',
    duration_ms: 1500,
    threshold_ms: 1000,
    timestamp: '2026-01-28T12:00:00.000Z',
    severity: 'error' as const,
  };

  it('should accept a valid timeout event', () => {
    const result = TimeoutEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('should accept event with allowed_context', () => {
    const event = {
      ...validEvent,
      allowed_context: {
        agent_id: 'semgrep',
        file_path: 'src/main.ts',
        retry_count: 2,
      },
    };
    const result = TimeoutEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should reject event with invalid operation_id format', () => {
    const event = {
      ...validEvent,
      operation_id: 'invalid-format',
    };
    const result = TimeoutEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event with negative duration_ms', () => {
    const event = {
      ...validEvent,
      duration_ms: -100,
    };
    const result = TimeoutEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event with zero threshold_ms', () => {
    const event = {
      ...validEvent,
      threshold_ms: 0,
    };
    const result = TimeoutEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event with invalid timestamp format', () => {
    const event = {
      ...validEvent,
      timestamp: 'not-a-date',
    };
    const result = TimeoutEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event with invalid severity', () => {
    const event = {
      ...validEvent,
      severity: 'invalid',
    };
    const result = TimeoutEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('OperationId', () => {
  it('should accept valid operation IDs', () => {
    const validIds = [
      'local_llm_req123',
      'pattern_eval_abc123',
      'subprocess_semgrep',
      'local_llm_req_abc-123',
    ];

    for (const id of validIds) {
      const result = OperationId.safeParse(id);
      expect(result.success, `Expected "${id}" to be valid`).toBe(true);
    }
  });

  it('should reject invalid operation IDs', () => {
    const invalidIds = ['', 'no-underscore', 'UPPERCASE_id', '123_numeric_start', 'single'];

    for (const id of invalidIds) {
      const result = OperationId.safeParse(id);
      expect(result.success, `Expected "${id}" to be invalid`).toBe(false);
    }
  });
});

describe('AllowedContextSchema', () => {
  it('should accept valid context', () => {
    const context = {
      agent_id: 'semgrep',
      file_path: 'src/main.ts',
      pattern_hash: '1234567890abcdef',
      retry_count: 3,
      model_name: 'gpt-4',
    };
    const result = AllowedContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it('should accept empty context', () => {
    const result = AllowedContextSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject unknown fields (strict mode)', () => {
    const context = {
      agent_id: 'semgrep',
      unknown_field: 'value',
    };
    const result = AllowedContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it('should reject invalid pattern_hash format', () => {
    const context = {
      pattern_hash: 'invalid',
    };
    const result = AllowedContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it('should reject negative retry_count', () => {
    const context = {
      retry_count: -1,
    };
    const result = AllowedContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });
});

describe('TelemetryConfigSchema', () => {
  it('should accept valid config with console backend', () => {
    const config = {
      enabled: true,
      backends: ['console'],
      verbosity: 'standard',
    };
    const result = TelemetryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should accept config with jsonl backend when path provided', () => {
    const config = {
      enabled: true,
      backends: ['jsonl'],
      jsonl_path: '/tmp/telemetry.jsonl',
      verbosity: 'verbose',
    };
    const result = TelemetryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject jsonl backend without path', () => {
    const config = {
      enabled: true,
      backends: ['jsonl'],
      verbosity: 'standard',
    };
    const result = TelemetryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toBeDefined();
      expect(result.error.issues[0]?.path).toContain('jsonl_path');
    }
  });

  it('should apply default values', () => {
    const config = {
      enabled: true,
      backends: ['console'],
    };
    const result = TelemetryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verbosity).toBe('standard');
      expect(result.data.buffer_size).toBe(100);
      expect(result.data.flush_interval_ms).toBe(5000);
    }
  });

  it('should reject empty backends array', () => {
    const config = {
      enabled: true,
      backends: [],
    };
    const result = TelemetryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid backend type', () => {
    const config = {
      enabled: true,
      backends: ['invalid'],
    };
    const result = TelemetryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject buffer_size out of range', () => {
    const configLow = {
      enabled: true,
      backends: ['console'],
      buffer_size: 0,
    };
    expect(TelemetryConfigSchema.safeParse(configLow).success).toBe(false);

    const configHigh = {
      enabled: true,
      backends: ['console'],
      buffer_size: 10001,
    };
    expect(TelemetryConfigSchema.safeParse(configHigh).success).toBe(false);
  });

  it('should reject flush_interval_ms out of range', () => {
    const configLow = {
      enabled: true,
      backends: ['console'],
      flush_interval_ms: 50,
    };
    expect(TelemetryConfigSchema.safeParse(configLow).success).toBe(false);

    const configHigh = {
      enabled: true,
      backends: ['console'],
      flush_interval_ms: 60001,
    };
    expect(TelemetryConfigSchema.safeParse(configHigh).success).toBe(false);
  });
});

describe('TimeoutSeverity', () => {
  it('should accept valid severity values', () => {
    const validValues = ['warning', 'error', 'critical'];
    for (const value of validValues) {
      const result = TimeoutSeverity.safeParse(value);
      expect(result.success, `Expected "${value}" to be valid`).toBe(true);
    }
  });

  it('should reject invalid severity values', () => {
    const result = TimeoutSeverity.safeParse('info');
    expect(result.success).toBe(false);
  });
});

describe('TelemetryBackendType', () => {
  it('should accept valid backend types', () => {
    const validTypes = ['console', 'jsonl'];
    for (const type of validTypes) {
      const result = TelemetryBackendType.safeParse(type);
      expect(result.success, `Expected "${type}" to be valid`).toBe(true);
    }
  });
});

describe('TelemetryVerbosity', () => {
  it('should accept valid verbosity levels', () => {
    const validLevels = ['minimal', 'standard', 'verbose'];
    for (const level of validLevels) {
      const result = TelemetryVerbosity.safeParse(level);
      expect(result.success, `Expected "${level}" to be valid`).toBe(true);
    }
  });
});

describe('createTimeoutEvent', () => {
  it('should create event with auto-generated timestamp', () => {
    const input = {
      operation_id: 'test_op_123',
      duration_ms: 500,
      threshold_ms: 1000,
      severity: 'warning' as const,
    };

    const before = new Date().toISOString();
    const event = createTimeoutEvent(input);
    const after = new Date().toISOString();

    expect(event.operation_id).toBe(input.operation_id);
    expect(event.duration_ms).toBe(input.duration_ms);
    expect(event.threshold_ms).toBe(input.threshold_ms);
    expect(event.severity).toBe(input.severity);
    expect(event.timestamp).toBeDefined();
    expect(event.timestamp >= before).toBe(true);
    expect(event.timestamp <= after).toBe(true);
  });
});

describe('DEFAULT_TELEMETRY_CONFIG', () => {
  it('should have telemetry disabled by default', () => {
    expect(DEFAULT_TELEMETRY_CONFIG.enabled).toBe(false);
  });

  it('should use console backend by default', () => {
    expect(DEFAULT_TELEMETRY_CONFIG.backends).toEqual(['console']);
  });

  it('should use standard verbosity by default', () => {
    expect(DEFAULT_TELEMETRY_CONFIG.verbosity).toBe('standard');
  });
});
