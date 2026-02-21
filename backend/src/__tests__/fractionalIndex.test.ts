import { describe, it, expect } from 'vitest';
import {
  generateInitialPosition,
  generatePositionBefore,
  generatePositionAfter,
  generatePositionBetween,
  comparePositions,
  isValidPosition,
  generatePositions,
} from '../utils/fractionalIndex.js';

describe('Fractional Indexing', () => {
  describe('generateInitialPosition', () => {
    it('should generate a valid initial position', () => {
      const position = generateInitialPosition();
      expect(isValidPosition(position)).toBe(true);
      expect(position.length).toBeGreaterThan(0);
    });
  });

  describe('generatePositionBefore', () => {
    it('should generate a position before the given position', () => {
      const position = 'V';
      const before = generatePositionBefore(position);
      expect(comparePositions(before, position)).toBeLessThan(0);
    });

    it('should handle positions at the start of the range', () => {
      // Note: "0" is the minimum character, so we test with a slightly higher value
      const position = '1';
      const before = generatePositionBefore(position);
      expect(comparePositions(before, position)).toBeLessThan(0);
    });
  });

  describe('generatePositionAfter', () => {
    it('should generate a position after the given position', () => {
      const position = 'V';
      const after = generatePositionAfter(position);
      expect(comparePositions(after, position)).toBeGreaterThan(0);
    });

    it('should handle positions at the end of the range', () => {
      const position = 'zzzzzz';
      const after = generatePositionAfter(position);
      expect(comparePositions(after, position)).toBeGreaterThan(0);
    });
  });

  describe('generatePositionBetween', () => {
    it('should generate a position between two positions', () => {
      const before = 'A';
      const after = 'z';
      const between = generatePositionBetween(before, after);
      expect(comparePositions(between, before)).toBeGreaterThan(0);
      expect(comparePositions(between, after)).toBeLessThan(0);
    });

    it('should handle adjacent positions', () => {
      const before = 'Va';
      const after = 'Vb';
      const between = generatePositionBetween(before, after);
      expect(comparePositions(between, before)).toBeGreaterThan(0);
      expect(comparePositions(between, after)).toBeLessThan(0);
    });

    it('should handle very close positions by extending length', () => {
      const before = 'V0';
      const after = 'V1';
      const between = generatePositionBetween(before, after);
      expect(comparePositions(between, before)).toBeGreaterThan(0);
      expect(comparePositions(between, after)).toBeLessThan(0);
    });

    it('should return initial position when both are undefined', () => {
      const position = generatePositionBetween(undefined, undefined);
      expect(isValidPosition(position)).toBe(true);
    });

    it('should generate before when only after is provided', () => {
      const after = 'V';
      const position = generatePositionBetween(undefined, after);
      expect(comparePositions(position, after)).toBeLessThan(0);
    });

    it('should generate after when only before is provided', () => {
      const before = 'V';
      const position = generatePositionBetween(before, undefined);
      expect(comparePositions(position, before)).toBeGreaterThan(0);
    });
  });

  describe('comparePositions', () => {
    it('should correctly compare positions', () => {
      expect(comparePositions('A', 'B')).toBeLessThan(0);
      expect(comparePositions('Z', 'A')).toBeGreaterThan(0);
      expect(comparePositions('M', 'M')).toBe(0);
    });

    it('should handle different length positions', () => {
      expect(comparePositions('A', 'AA')).toBeLessThan(0);
      expect(comparePositions('B', 'AA')).toBeGreaterThan(0);
    });
  });

  describe('isValidPosition', () => {
    it('should return true for valid positions', () => {
      expect(isValidPosition('Mzzzzz')).toBe(true);
      expect(isValidPosition('ABC123')).toBe(true);
      expect(isValidPosition('a')).toBe(true);
    });

    it('should return false for invalid positions', () => {
      expect(isValidPosition('')).toBe(false);
      expect(isValidPosition('abc!@#')).toBe(false);
      expect(isValidPosition('abc def')).toBe(false);
    });
  });

  describe('generatePositions', () => {
    it('should generate multiple positions in order', () => {
      const positions = generatePositions(5);
      for (let i = 1; i < positions.length; i++) {
        expect(comparePositions(positions[i - 1], positions[i])).toBeLessThan(0);
      }
    });

    it('should generate positions between boundaries', () => {
      const before = 'A';
      const after = 'Z';
      const positions = generatePositions(3, before, after);
      expect(positions.length).toBe(3);
      positions.forEach((pos) => {
        expect(comparePositions(pos, before)).toBeGreaterThan(0);
        expect(comparePositions(pos, after)).toBeLessThan(0);
      });
    });

    it('should return empty array for count 0', () => {
      expect(generatePositions(0)).toEqual([]);
    });
  });

  describe('O(1) amortized ordering', () => {
    it('should handle many sequential insertions without degradation', () => {
      // Simulate inserting 100 items at the end
      let lastPosition = generateInitialPosition();
      const positions: string[] = [lastPosition];

      for (let i = 0; i < 100; i++) {
        const newPosition = generatePositionAfter(lastPosition);
        expect(comparePositions(newPosition, lastPosition)).toBeGreaterThan(0);
        // Position length should remain reasonable (not grow linearly)
        expect(newPosition.length).toBeLessThan(20);
        positions.push(newPosition);
        lastPosition = newPosition;
      }

      // Verify all positions are in order
      for (let i = 1; i < positions.length; i++) {
        expect(comparePositions(positions[i - 1], positions[i])).toBeLessThan(0);
      }
    });

    it('should handle interleaved insertions', () => {
      const positions = ['A', 'Z'];

      // Insert between A and Z multiple times
      for (let i = 0; i < 20; i++) {
        const between = generatePositionBetween(positions[0], positions[1]);
        expect(comparePositions(between, positions[0])).toBeGreaterThan(0);
        expect(comparePositions(between, positions[1])).toBeLessThan(0);
        positions.splice(1, 0, between);
      }

      // Verify all positions are in order
      for (let i = 1; i < positions.length; i++) {
        expect(comparePositions(positions[i - 1], positions[i])).toBeLessThan(0);
      }
    });
  });
});
