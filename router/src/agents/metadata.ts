/**
 * Typed Metadata Helpers Module
 *
 * Provides type-safe access to common metadata fields in Finding and AgentContext.
 *
 * CONSTRAINT (FR-028): This module MUST NOT import from agent implementations.
 * Only allowed imports: ./types.ts, ./index.ts
 * Enforced via depcruise rule: no-metadata-back-edges
 */

// ============================================================================
// Security Metadata (Finding.metadata)
// ============================================================================

/**
 * Known metadata fields for security-related findings.
 */
export interface SecurityMetadata {
  /** CWE identifier (e.g., "CWE-79") */
  cwe?: string;
  /** OWASP category (e.g., "A03:2021-Injection") */
  owasp?: string;
  /** Confidence level of the finding */
  confidence?: 'high' | 'medium' | 'low';
  /** CVE identifier if applicable */
  cveId?: string;
}

/**
 * Extract typed security metadata from a finding.
 * Unknown fields are filtered out, known fields are type-validated.
 *
 * @param finding - The finding to extract metadata from (only needs metadata field)
 * @returns Typed security metadata (fields may be undefined)
 */
export function getSecurityMetadata(finding: {
  metadata?: Record<string, unknown>;
}): SecurityMetadata {
  const m = finding.metadata ?? {};
  return {
    cwe: typeof m['cwe'] === 'string' ? m['cwe'] : undefined,
    owasp: typeof m['owasp'] === 'string' ? m['owasp'] : undefined,
    confidence: isConfidenceLevel(m['confidence']) ? m['confidence'] : undefined,
    cveId: typeof m['cveId'] === 'string' ? m['cveId'] : undefined,
  };
}

function isConfidenceLevel(value: unknown): value is 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low';
}

// ============================================================================
// Environment Variables (AgentContext.env)
// ============================================================================

/**
 * Well-known environment variables used by agents.
 */
export interface KnownEnvVars {
  /** GitHub personal access token */
  GITHUB_TOKEN?: string;
  /** Azure DevOps personal access token */
  AZURE_DEVOPS_PAT?: string;
  /** Azure DevOps system access token (pipelines) */
  SYSTEM_ACCESSTOKEN?: string;
  /** Anthropic API key */
  ANTHROPIC_API_KEY?: string;
  /** OpenAI API key */
  OPENAI_API_KEY?: string;
  /** Azure OpenAI API key */
  AZURE_OPENAI_API_KEY?: string;
}

/**
 * Extract typed known environment variables from the context.
 *
 * @param env - The raw environment record from AgentContext
 * @returns Typed environment variables (fields may be undefined)
 */
export function getKnownEnv(env: Record<string, string | undefined>): KnownEnvVars {
  return {
    GITHUB_TOKEN: env['GITHUB_TOKEN'],
    AZURE_DEVOPS_PAT: env['AZURE_DEVOPS_PAT'],
    SYSTEM_ACCESSTOKEN: env['SYSTEM_ACCESSTOKEN'],
    ANTHROPIC_API_KEY: env['ANTHROPIC_API_KEY'],
    OPENAI_API_KEY: env['OPENAI_API_KEY'],
    AZURE_OPENAI_API_KEY: env['AZURE_OPENAI_API_KEY'],
  };
}
