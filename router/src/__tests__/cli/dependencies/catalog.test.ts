/**
 * Unit tests for dependency catalog structure.
 */

import { describe, expect, it } from 'vitest';

import {
  DEPENDENCY_CATALOG,
  AGENT_DEPENDENCIES,
  getDependenciesForAgent,
  getDependencyInfo,
  getAllDependencyNames,
  agentRequiresExternalDeps,
} from '../../../cli/dependencies/catalog.js';

describe('dependency catalog', () => {
  describe('DEPENDENCY_CATALOG structure', () => {
    it('contains semgrep entry', () => {
      expect(DEPENDENCY_CATALOG['semgrep']).toBeDefined();
    });

    it('contains reviewdog entry', () => {
      expect(DEPENDENCY_CATALOG['reviewdog']).toBeDefined();
    });

    it.each(Object.keys(DEPENDENCY_CATALOG))('entry "%s" has all required fields', (name) => {
      const entry = DEPENDENCY_CATALOG[name];
      expect(entry).toBeDefined();
      if (!entry) return;

      expect(entry.name).toBe(name);
      expect(typeof entry.displayName).toBe('string');
      expect(entry.displayName.length).toBeGreaterThan(0);

      // versionCommand should be [binary, args[]]
      expect(Array.isArray(entry.versionCommand)).toBe(true);
      expect(entry.versionCommand).toHaveLength(2);
      expect(typeof entry.versionCommand[0]).toBe('string');
      expect(Array.isArray(entry.versionCommand[1])).toBe(true);

      // versionRegex should be a RegExp
      expect(entry.versionRegex).toBeInstanceOf(RegExp);

      // minVersion should be string or null
      expect(entry.minVersion === null || typeof entry.minVersion === 'string').toBe(true);

      // docsUrl should be a valid URL
      expect(typeof entry.docsUrl).toBe('string');
      expect(entry.docsUrl).toMatch(/^https?:\/\//);

      // installInstructions should have all platforms
      expect(typeof entry.installInstructions.darwin).toBe('string');
      expect(typeof entry.installInstructions.win32).toBe('string');
      expect(typeof entry.installInstructions.linux).toBe('string');
    });

    it('semgrep has correct version command', () => {
      const semgrep = DEPENDENCY_CATALOG['semgrep'];
      expect(semgrep).toBeDefined();
      expect(semgrep?.versionCommand).toEqual(['semgrep', ['--version']]);
    });

    it('reviewdog has correct version command', () => {
      const reviewdog = DEPENDENCY_CATALOG['reviewdog'];
      expect(reviewdog).toBeDefined();
      expect(reviewdog?.versionCommand).toEqual(['reviewdog', ['--version']]);
    });

    it('semgrep has minimum version 1.0.0', () => {
      const semgrep = DEPENDENCY_CATALOG['semgrep'];
      expect(semgrep).toBeDefined();
      expect(semgrep?.minVersion).toBe('1.0.0');
    });

    it('reviewdog has minimum version 0.14.0', () => {
      const reviewdog = DEPENDENCY_CATALOG['reviewdog'];
      expect(reviewdog).toBeDefined();
      expect(reviewdog?.minVersion).toBe('0.14.0');
    });
  });

  describe('AGENT_DEPENDENCIES structure', () => {
    const knownAgents = [
      'semgrep',
      'reviewdog',
      'opencode',
      'pr_agent',
      'local_llm',
      'ai_semantic_review',
      'control_flow',
    ];

    it.each(knownAgents)('has mapping for agent "%s"', (agent) => {
      expect(AGENT_DEPENDENCIES[agent]).toBeDefined();
      expect(Array.isArray(AGENT_DEPENDENCIES[agent])).toBe(true);
    });

    it('semgrep agent requires semgrep dependency', () => {
      expect(AGENT_DEPENDENCIES['semgrep']).toEqual(['semgrep']);
    });

    it('reviewdog agent requires semgrep and reviewdog dependencies', () => {
      expect(AGENT_DEPENDENCIES['reviewdog']).toEqual(['semgrep', 'reviewdog']);
    });

    it('AI agents have no external dependencies', () => {
      expect(AGENT_DEPENDENCIES['opencode']).toEqual([]);
      expect(AGENT_DEPENDENCIES['pr_agent']).toEqual([]);
      expect(AGENT_DEPENDENCIES['local_llm']).toEqual([]);
      expect(AGENT_DEPENDENCIES['ai_semantic_review']).toEqual([]);
      expect(AGENT_DEPENDENCIES['control_flow']).toEqual([]);
    });

    it('all referenced dependencies exist in DEPENDENCY_CATALOG', () => {
      const allDeps = Object.values(AGENT_DEPENDENCIES).flat();
      const uniqueDeps = [...new Set(allDeps)];

      for (const dep of uniqueDeps) {
        expect(DEPENDENCY_CATALOG[dep]).toBeDefined();
      }
    });
  });

  describe('getDependenciesForAgent', () => {
    it('returns dependencies for semgrep agent', () => {
      expect(getDependenciesForAgent('semgrep')).toEqual(['semgrep']);
    });

    it('returns dependencies for reviewdog agent', () => {
      expect(getDependenciesForAgent('reviewdog')).toEqual(['semgrep', 'reviewdog']);
    });

    it('returns empty array for AI agents', () => {
      expect(getDependenciesForAgent('opencode')).toEqual([]);
    });

    it('returns empty array for unknown agents', () => {
      expect(getDependenciesForAgent('unknown_agent')).toEqual([]);
    });
  });

  describe('getDependencyInfo', () => {
    it('returns info for semgrep', () => {
      const info = getDependencyInfo('semgrep');
      expect(info).toBeDefined();
      expect(info?.name).toBe('semgrep');
    });

    it('returns info for reviewdog', () => {
      const info = getDependencyInfo('reviewdog');
      expect(info).toBeDefined();
      expect(info?.name).toBe('reviewdog');
    });

    it('returns undefined for unknown dependency', () => {
      expect(getDependencyInfo('unknown_dep')).toBeUndefined();
    });
  });

  describe('getAllDependencyNames', () => {
    it('returns all known dependency names', () => {
      const names = getAllDependencyNames();
      expect(names).toContain('semgrep');
      expect(names).toContain('reviewdog');
    });

    it('returns correct count of dependencies', () => {
      const names = getAllDependencyNames();
      expect(names).toHaveLength(Object.keys(DEPENDENCY_CATALOG).length);
    });
  });

  describe('agentRequiresExternalDeps', () => {
    it('returns true for semgrep agent', () => {
      expect(agentRequiresExternalDeps('semgrep')).toBe(true);
    });

    it('returns true for reviewdog agent', () => {
      expect(agentRequiresExternalDeps('reviewdog')).toBe(true);
    });

    it('returns false for opencode agent', () => {
      expect(agentRequiresExternalDeps('opencode')).toBe(false);
    });

    it('returns false for pr_agent', () => {
      expect(agentRequiresExternalDeps('pr_agent')).toBe(false);
    });

    it('returns false for unknown agent', () => {
      expect(agentRequiresExternalDeps('unknown')).toBe(false);
    });
  });
});
