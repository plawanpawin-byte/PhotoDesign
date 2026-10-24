import { native } from './native';

// Ranking for the command search: every query character must appear in order. Earlier,
// consecutive and word-start matches score higher.

export interface Match<T> {
  item: T;
  score: number;
}

/** Score of `query` against `text`, or -1 when it doesn't match. Case-insensitive (done in Rust). */
export function score(query: string, text: string): number {
  return native().fuzzy_score(query, text);
}

/** Items matching `query`, best first; `text` gives each item's searchable text. */
export function rank<T>(items: readonly T[], query: string, text: (item: T) => string, limit = 50): Match<T>[] {
  const out: Match<T>[] = [];
  for (const item of items) {
    const s = score(query, text(item));
    if (s >= 0) out.push({ item, score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
