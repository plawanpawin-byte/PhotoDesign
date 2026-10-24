// Ranking for the command search: every query character must appear in order. Earlier,
// consecutive and word-start matches score higher.

export interface Match<T> {
  item: T;
  score: number;
}

const WORD_BREAK = /[\s./>_\-…]/;

/** Score of `query` against `text`, or -1 when it doesn't match. Case-insensitive. */
export function score(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct * 2 - (t.length - q.length) * 0.1 + (direct === 0 || WORD_BREAK.test(t[direct - 1] ?? '') ? 200 : 0);
  let total = 0;
  let at = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const i = t.indexOf(ch, at);
    if (i < 0) return -1;
    run = i === at ? run + 1 : 0;
    total += 10 + run * 5 + (i === 0 || WORD_BREAK.test(t[i - 1] ?? '') ? 15 : 0) - (i - at) * 0.5;
    at = i + 1;
  }
  return total;
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
