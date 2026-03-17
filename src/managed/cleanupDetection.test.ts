import { describe, expect, it } from 'vitest';

import { jaccard, needsCleanup, shingles } from './cleanupDetection';

describe('cleanupDetection', () => {
  describe('shingles', () => {
    it('should generate 3-word shingles', () => {
      const result = shingles('the quick brown fox jumps');
      expect(result.size).toBe(3);
      expect(result.has('the quick brown')).toBe(true);
      expect(result.has('quick brown fox')).toBe(true);
      expect(result.has('brown fox jumps')).toBe(true);
    });

    it('should return empty set for short text', () => {
      expect(shingles('one two').size).toBe(0);
    });

    it('should be case-insensitive', () => {
      const a = shingles('The Quick Brown');
      const b = shingles('the quick brown');
      expect(a).toEqual(b);
    });
  });

  describe('jaccard', () => {
    it('should return 1 for identical sets', () => {
      const a = new Set(['a', 'b', 'c']);
      expect(jaccard(a, a)).toBe(1);
    });

    it('should return 0 for disjoint sets', () => {
      const a = new Set(['a', 'b']);
      const b = new Set(['c', 'd']);
      expect(jaccard(a, b)).toBe(0);
    });

    it('should return 0 for empty sets', () => {
      expect(jaccard(new Set(), new Set())).toBe(0);
    });

    it('should compute partial overlap correctly', () => {
      const a = new Set(['a', 'b', 'c']);
      const b = new Set(['b', 'c', 'd']);
      // intersection: {b, c} = 2, union: {a,b,c,d} = 4
      expect(jaccard(a, b)).toBe(0.5);
    });
  });

  describe('needsCleanup', () => {
    it('should return false for empty user content', () => {
      expect(needsCleanup('some managed content here', '')).toBe(false);
      expect(needsCleanup('some managed content here', '  \n  ')).toBe(false);
    });

    it('should return true for duplicate content', () => {
      const managed =
        'The platform tools section contains service health data and port assignments for all services.';
      const user =
        'The platform tools section contains service health data and port assignments for all services.';
      expect(needsCleanup(managed, user)).toBe(true);
    });

    it('should return false for unrelated content', () => {
      const managed =
        'The platform tools section contains service health data and port assignments for all services.';
      const user =
        'My personal notes about grocery shopping and weekend plans for the family.';
      expect(needsCleanup(managed, user)).toBe(false);
    });

    it('should detect partial overlap (orphaned content)', () => {
      const managed = [
        'Jeeves Platform Tools provides service health monitoring.',
        'The watcher indexes files into Qdrant for semantic search.',
        'The runner executes scheduled jobs from SQLite state.',
        'The server presents web UI with file browser and export.',
        'The meta service distills synthesis through three-step LLM.',
      ].join(' ');

      const user = [
        '# My Notes',
        'The watcher indexes files into Qdrant for semantic search.',
        'The runner executes scheduled jobs from SQLite state.',
        'Some of my own thoughts about the project.',
      ].join(' ');

      expect(needsCleanup(managed, user)).toBe(true);
    });

    it('should not false-positive on brief mentions', () => {
      const managed = [
        'Jeeves Platform Tools provides comprehensive service health monitoring.',
        'The watcher indexes files into Qdrant for semantic search capabilities.',
        'The runner executes scheduled jobs managed through SQLite state storage.',
      ].join(' ');

      const user = 'I mentioned the watcher once in passing.';
      expect(needsCleanup(managed, user)).toBe(false);
    });

    it('should respect custom threshold', () => {
      const managed = 'alpha beta gamma delta epsilon zeta eta theta';
      const user = 'alpha beta gamma something else entirely here now';
      // Some overlap exists
      expect(needsCleanup(managed, user, 0.0)).toBe(true);
      expect(needsCleanup(managed, user, 0.99)).toBe(false);
    });
  });
});
