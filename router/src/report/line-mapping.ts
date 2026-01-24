/**
 * Line Mapping Utilities
 * Resolves finding line numbers against unified diffs to prevent misaligned comments.
 */

import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';

interface FileLineMapping {
  fileLines: Set<number>;
  diffLineToFileLine: Map<number, number>;
}

export interface LineResolver {
  resolveLine(filePath: string, line: number, sourceAgent?: string): number | null;
}

function normalizePath(filePath: string): string {
  return filePath.startsWith('/') ? filePath.slice(1) : filePath;
}

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return null;
  return { oldStart: parseInt(match[1] ?? '0', 10), newStart: parseInt(match[2] ?? '0', 10) };
}

function buildFileLineMapping(patch: string): FileLineMapping {
  const fileLines = new Set<number>();
  const diffLineToFileLine = new Map<number, number>();

  const lines = patch.split('\n');
  let newLine = 0;
  let inHunk = false;
  let diffLine = 0;

  for (const rawLine of lines) {
    if (rawLine.startsWith('@@')) {
      const header = parseHunkHeader(rawLine);
      if (header) {
        newLine = header.newStart;
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) {
      continue;
    }

    if (rawLine.startsWith('\\')) {
      continue;
    }

    diffLine += 1;

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      fileLines.add(newLine);
      diffLineToFileLine.set(diffLine, newLine);
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      continue;
    }

    fileLines.add(newLine);
    diffLineToFileLine.set(diffLine, newLine);
    newLine += 1;
  }

  return { fileLines, diffLineToFileLine };
}

function shouldPreferDiffLine(sourceAgent?: string): boolean {
  if (!sourceAgent) return false;
  return ['opencode', 'pr_agent', 'ai_semantic_review', 'local_llm'].includes(sourceAgent);
}

export function buildLineResolver(files: DiffFile[]): LineResolver {
  const mappings = new Map<string, FileLineMapping>();

  for (const file of files) {
    if (!file.patch) continue;
    mappings.set(normalizePath(file.path), buildFileLineMapping(file.patch));
  }

  return {
    resolveLine(filePath: string, line: number, sourceAgent?: string): number | null {
      const mapping = mappings.get(normalizePath(filePath));
      if (!mapping) return line;
      const diffCandidate = mapping.diffLineToFileLine.get(line);
      const hasFileLine = mapping.fileLines.has(line);
      const preferDiffLine = shouldPreferDiffLine(sourceAgent);

      if (preferDiffLine && diffCandidate) {
        return diffCandidate;
      }

      if (hasFileLine) return line;
      return null;
    },
  };
}

export function normalizeFindingsForDiff(findings: Finding[], resolver: LineResolver): Finding[] {
  return findings.map((finding) => {
    if (!finding.line) return finding;
    const resolvedLine = resolver.resolveLine(finding.file, finding.line, finding.sourceAgent);
    if (!resolvedLine) {
      return {
        ...finding,
        line: undefined,
        endLine: undefined,
      };
    }

    if (!finding.endLine) {
      return {
        ...finding,
        line: resolvedLine,
      };
    }

    const resolvedEndLine =
      resolver.resolveLine(finding.file, finding.endLine, finding.sourceAgent) ?? resolvedLine;
    return {
      ...finding,
      line: resolvedLine,
      endLine: resolvedEndLine,
    };
  });
}
