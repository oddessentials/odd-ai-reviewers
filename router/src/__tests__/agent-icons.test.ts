import { describe, it, expect } from 'vitest';
import { getAgentIcon, AGENT_ICONS, DEFAULT_AGENT_ICON } from '../report/agent-icons.js';

describe('agent-icons', () => {
  describe('AGENT_ICONS mapping', () => {
    it('should have icons for all known agents', () => {
      // Document expected agents for regression protection
      const expectedAgents = [
        'local_llm',
        'opencode',
        'pr_agent',
        'reviewdog',
        'semgrep',
        'ai_semantic_review',
        'control_flow',
      ];

      for (const agentId of expectedAgents) {
        const icon = AGENT_ICONS[agentId];
        expect(icon).toBeDefined();
        expect(icon?.length).toBeGreaterThan(0);
      }
    });

    it('should have unique icons for each agent', () => {
      const icons = Object.values(AGENT_ICONS);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    it('should use emoji characters (not ASCII)', () => {
      for (const icon of Object.values(AGENT_ICONS)) {
        // Emoji characters have code points > 127
        const hasNonAscii = [...icon].some((char) => (char.codePointAt(0) ?? 0) > 127);
        expect(hasNonAscii).toBe(true);
      }
    });
  });

  describe('DEFAULT_AGENT_ICON', () => {
    it('should be the robot emoji', () => {
      expect(DEFAULT_AGENT_ICON).toBe('🤖');
    });

    it('should not match any known agent icon', () => {
      const knownIcons = Object.values(AGENT_ICONS);
      expect(knownIcons).not.toContain(DEFAULT_AGENT_ICON);
    });
  });

  describe('getAgentIcon', () => {
    describe('known agents', () => {
      it('returns brain emoji for local_llm (Ollama)', () => {
        expect(getAgentIcon('local_llm')).toBe('🧠');
      });

      it('returns technologist emoji for opencode', () => {
        expect(getAgentIcon('opencode')).toBe('🧑‍💻');
      });

      it('returns wolf emoji for pr_agent', () => {
        expect(getAgentIcon('pr_agent')).toBe('🐺');
      });

      it('returns fox emoji for reviewdog', () => {
        expect(getAgentIcon('reviewdog')).toBe('🦊');
      });

      it('returns shield emoji for semgrep', () => {
        expect(getAgentIcon('semgrep')).toBe('🛡');
      });

      it('returns microscope emoji for ai_semantic_review', () => {
        expect(getAgentIcon('ai_semantic_review')).toBe('🔬');
      });

      it('returns shuffle emoji for control_flow', () => {
        expect(getAgentIcon('control_flow')).toBe('🔀');
      });
    });

    describe('unknown agents', () => {
      it('returns default icon for unknown agent ID', () => {
        expect(getAgentIcon('unknown-agent')).toBe(DEFAULT_AGENT_ICON);
      });

      it('returns default icon for arbitrary string', () => {
        expect(getAgentIcon('my-custom-tool')).toBe(DEFAULT_AGENT_ICON);
      });

      it('returns default icon for empty string', () => {
        expect(getAgentIcon('')).toBe(DEFAULT_AGENT_ICON);
      });
    });

    describe('case sensitivity', () => {
      it('is case-sensitive (uppercase variants return default)', () => {
        expect(getAgentIcon('Semgrep')).toBe(DEFAULT_AGENT_ICON);
        expect(getAgentIcon('SEMGREP')).toBe(DEFAULT_AGENT_ICON);
        expect(getAgentIcon('SemGrep')).toBe(DEFAULT_AGENT_ICON);
      });

      it('requires exact match', () => {
        expect(getAgentIcon('semgrep')).toBe('🛡');
        expect(getAgentIcon(' semgrep')).toBe(DEFAULT_AGENT_ICON);
        expect(getAgentIcon('semgrep ')).toBe(DEFAULT_AGENT_ICON);
      });
    });

    describe('edge cases', () => {
      it('handles agent ID with special characters', () => {
        expect(getAgentIcon('agent-with-dashes')).toBe(DEFAULT_AGENT_ICON);
        expect(getAgentIcon('agent.with.dots')).toBe(DEFAULT_AGENT_ICON);
        expect(getAgentIcon('agent_with_underscores')).toBe(DEFAULT_AGENT_ICON);
      });

      it('handles very long agent ID', () => {
        const longId = 'a'.repeat(1000);
        expect(getAgentIcon(longId)).toBe(DEFAULT_AGENT_ICON);
      });

      it('handles agent ID with unicode characters', () => {
        expect(getAgentIcon('агент')).toBe(DEFAULT_AGENT_ICON); // Russian
        expect(getAgentIcon('エージェント')).toBe(DEFAULT_AGENT_ICON); // Japanese
      });
    });
  });

  describe('integration: icon mapping consistency', () => {
    it('getAgentIcon returns same values as direct AGENT_ICONS lookup', () => {
      for (const agentId of Object.keys(AGENT_ICONS)) {
        expect(getAgentIcon(agentId)).toBe(AGENT_ICONS[agentId]);
      }
    });

    it('all icons render as single grapheme clusters', () => {
      // Important for consistent display width in markdown tables
      const allIcons = [...Object.values(AGENT_ICONS), DEFAULT_AGENT_ICON];

      for (const icon of allIcons) {
        // Use Intl.Segmenter if available, otherwise basic check
        // Most emoji should be 1-2 code points rendered as single character
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        const segments = [...segmenter.segment(icon)];
        expect(segments.length).toBe(1);
      }
    });
  });
});
