export interface ThreadFindMatch {
  readonly rowId: string;
  readonly occurrence: number;
}

export function clampThreadFindIndex(index: number, total: number): number {
  if (total <= 0 || !Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), total - 1);
}

export function stepThreadFindIndex(index: number, total: number, delta: number): number {
  if (total <= 0) return 0;
  const clamped = clampThreadFindIndex(index, total);
  return (((clamped + delta) % total) + total) % total;
}

export function formatThreadFindCount(index: number, total: number): string {
  return total <= 0 ? "0/0" : `${clampThreadFindIndex(index, total) + 1}/${total}`;
}

/**
 * Case-insensitive non-overlapping substring occurrences within `text`.
 * Aligns with t3code's `findThreadSearchOccurrences`.
 */
export function findThreadSearchOccurrences(text: string, query: string): number[] {
  const needle = query.toLocaleLowerCase();
  if (needle.length === 0 || text.length < needle.length) return [];
  const haystack = text.toLocaleLowerCase();
  const offsets: number[] = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    offsets.push(found);
    cursor = found + needle.length;
  }
  return offsets;
}
