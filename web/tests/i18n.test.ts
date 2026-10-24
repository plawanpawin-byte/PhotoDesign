import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TH, getLang, setLang, t } from '../src/lib/i18n';
import { ADJUST_GROUPS } from '../src/ui/inspector';
import { PRESETS } from '../src/ui/overlays';
import { TOOLS } from '../src/tools/tools';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'pkg' ? [] : sources(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('Thai', () => {
  it('translates and falls back to English', () => {
    expect(getLang()).toBe('en');
    expect(t('Brush')).toBe('Brush');
    setLang('th');
    try {
      expect(t('Brush')).toBe('พู่กัน');
      expect(t('A string nobody translated')).toBe('A string nobody translated');
    } finally {
      setLang('en');
    }
  });

  it('has no empty entries', () => {
    for (const [k, v] of Object.entries(TH)) expect(v.trim(), k).not.toBe('');
  });

  it('every string passed to t() in the source has a Thai translation', () => {
    const missing = new Set<string>();
    const root = join(__dirname, '..', 'src');
    for (const file of sources(root)) {
      if (file.endsWith('i18n.ts')) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g)) {
        const s = m[2]!.replace(/\\'/g, "'");
        if (!(s in TH)) missing.add(`${file.split('/src/')[1]}: ${s}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('the tool, preset and adjustment names that are passed through t() later are translated too', () => {
    const names = [
      ...TOOLS.flatMap((x) => [x.label, x.hint]),
      ...PRESETS.flatMap((p) => [p.name, p.note]),
      ...ADJUST_GROUPS.flatMap((g) => [g.title, g.note, ...g.controls.map((c) => c.label)]),
    ];
    expect(names.filter((n) => !(n in TH))).toEqual([]);
  });
});
