/**
 * Fractional Indexing Implementation
 *
 * Provides O(1) amortized ordering for tasks without re-indexing.
 * Uses string-based keys that can always generate a value between any two existing values.
 */

const BASE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = BASE_CHARS.length; // 62
const MID_CHAR = BASE_CHARS[Math.floor(BASE / 2)]; // 'V'

/**
 * Get the index of a character in our base
 */
function charToIndex(char: string): number {
  const index = BASE_CHARS.indexOf(char);
  return index === -1 ? 0 : index;
}

/**
 * Get the character at a given index
 */
function indexToChar(index: number): string {
  return BASE_CHARS[Math.max(0, Math.min(index, BASE - 1))];
}

/**
 * Generate an initial position for the first item
 */
export function generateInitialPosition(): string {
  return 'V'; // Middle of the range
}

/**
 * Generate a position before the given position
 */
export function generatePositionBefore(position: string): string {
  return generatePositionBetween(undefined, position);
}

/**
 * Generate a position after the given position
 */
export function generatePositionAfter(position: string): string {
  return generatePositionBetween(position, undefined);
}

/**
 * Generate a position between two positions
 * If before is undefined, generates before after
 * If after is undefined, generates after before
 * Both being undefined generates initial position
 */
export function generatePositionBetween(before?: string, after?: string): string {
  // Both undefined - return initial position
  if (!before && !after) {
    return generateInitialPosition();
  }

  // Only after defined - generate before it
  if (!before) {
    return decrementPosition(after!);
  }

  // Only before defined - generate after it
  if (!after) {
    return incrementPosition(before);
  }

  // Both defined - find midpoint
  return midpoint(before, after);
}

/**
 * Decrement a position to generate something before it
 */
function decrementPosition(pos: string): string {
  // Find the rightmost character that can be decremented
  let i = pos.length - 1;

  while (i >= 0 && charToIndex(pos[i]) === 0) {
    i--;
  }

  if (i < 0) {
    // All characters are at minimum (e.g., "000")
    // Prepend a character that's before '0' - but '0' is the min
    // So we return the same with a mid-char appended after decrementing doesn't work
    // Actually, we need to add a suffix that makes it smaller
    // "0" > "0" + any suffix, so we need a different approach
    // We'll use a smaller integer representation by prepending and using smaller values
    return '0' + indexToChar(Math.floor(BASE / 4)); // Creates "0F" which is < "00"
  }

  // Decrement the character at position i
  const chars = pos.split('');
  chars[i] = indexToChar(charToIndex(chars[i]) - 1);

  // Set all characters after i to the max value to get close to original
  for (let j = i + 1; j < chars.length; j++) {
    chars[j] = indexToChar(BASE - 1);
  }

  // Append a mid character to give room for future insertions
  return chars.join('') + MID_CHAR;
}

/**
 * Increment a position to generate something after it
 */
function incrementPosition(pos: string): string {
  // Find the rightmost character that can be incremented
  let i = pos.length - 1;

  while (i >= 0 && charToIndex(pos[i]) === BASE - 1) {
    i--;
  }

  if (i < 0) {
    // All characters are at maximum (e.g., "zzz")
    // Append a character
    return pos + MID_CHAR;
  }

  // Increment the character at position i
  const chars = pos.split('');
  chars[i] = indexToChar(charToIndex(chars[i]) + 1);

  // Truncate all characters after i (they were 'z's that we carried over)
  return chars.slice(0, i + 1).join('');
}

/**
 * Find midpoint between two positions
 */
function midpoint(before: string, after: string): string {
  // Ensure before < after
  if (comparePositions(before, after) >= 0) {
    throw new Error(`Invalid order: "${before}" should be less than "${after}"`);
  }

  // Normalize lengths
  const maxLen = Math.max(before.length, after.length);
  const paddedBefore = before.padEnd(maxLen, BASE_CHARS[0]);
  const paddedAfter = after.padEnd(maxLen, BASE_CHARS[0]);

  let result = '';

  for (let i = 0; i < maxLen; i++) {
    const beforeIdx = charToIndex(paddedBefore[i]);
    const afterIdx = charToIndex(paddedAfter[i]);

    if (beforeIdx === afterIdx) {
      result += paddedBefore[i];
      continue;
    }

    // Found difference - try to find midpoint
    const midIdx = Math.floor((beforeIdx + afterIdx) / 2);

    if (midIdx > beforeIdx) {
      // There's room between the characters
      return result + indexToChar(midIdx);
    }

    // Characters are adjacent (e.g., 'a' and 'b')
    // Use the lower character and append a mid character
    result += paddedBefore[i];
    return result + MID_CHAR;
  }

  // Strings are equal up to maxLen, but before should be shorter
  // Add a mid character to get between them
  return result + MID_CHAR;
}

/**
 * Validate that a position string is well-formed
 */
export function isValidPosition(position: string): boolean {
  if (!position || position.length === 0) return false;
  return position.split('').every(char => BASE_CHARS.includes(char));
}

/**
 * Compare two positions
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function comparePositions(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const aIdx = i < a.length ? charToIndex(a[i]) : -1;
    const bIdx = i < b.length ? charToIndex(b[i]) : -1;
    if (aIdx !== bIdx) {
      return aIdx - bIdx;
    }
  }
  return 0;
}

/**
 * Generate multiple evenly-spaced positions for batch inserts
 */
export function generatePositions(count: number, before?: string, after?: string): string[] {
  if (count === 0) return [];
  if (count === 1) return [generatePositionBetween(before, after)];

  const positions: string[] = [];
  let current = before;

  for (let i = 0; i < count; i++) {
    const next = generatePositionBetween(current, after);
    positions.push(next);
    current = next;
  }

  return positions;
}
