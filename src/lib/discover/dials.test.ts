import { describe, it, expect } from 'vitest';
import { DEFAULT_SCOPE } from '$lib/catalog/scope';
import {
  CATEGORY_CHIPS,
  PLAYER_CHIPS,
  COMPLEXITY_BANDS,
  toggleCategory,
  isCategoryOn,
  isBandOn,
  bandPatch,
  complexityLabel,
  complexityBandIndex
} from './dials';

describe('category chips', () => {
  it('offers six chips, each with a non-empty backing value', () => {
    expect(CATEGORY_CHIPS).toHaveLength(6);
    for (const c of CATEGORY_CHIPS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.value.length).toBeGreaterThan(0);
      expect(['categories', 'mechanics']).toContain(c.field);
    }
  });

  it('routes Cooperative to mechanics, not categories', () => {
    const coop = CATEGORY_CHIPS.find((c) => c.label === 'Cooperative');
    expect(coop).toBeDefined();
    expect(coop!.field).toBe('mechanics');
    expect(coop!.value).toBe('Cooperative Game');
  });

  it('turns a chip on, then off, returning to empty', () => {
    const chip = CATEGORY_CHIPS.find((c) => c.label === 'Wargame')!;
    const on = { ...DEFAULT_SCOPE, ...toggleCategory(DEFAULT_SCOPE, chip) };
    expect(on.categories).toEqual(['Wargame']);
    expect(isCategoryOn(on, chip)).toBe(true);

    const off = { ...on, ...toggleCategory(on, chip) };
    expect(off.categories).toEqual([]);
    expect(isCategoryOn(off, chip)).toBe(false);
  });

  it('keeps other selections when toggling one chip', () => {
    const war = CATEGORY_CHIPS.find((c) => c.label === 'Wargame')!;
    const eco = CATEGORY_CHIPS.find((c) => c.label === 'Economic')!;
    let s = { ...DEFAULT_SCOPE, ...toggleCategory(DEFAULT_SCOPE, war) };
    s = { ...s, ...toggleCategory(s, eco) };
    expect(s.categories.sort()).toEqual(['Economic', 'Wargame']);

    s = { ...s, ...toggleCategory(s, war) };
    expect(s.categories).toEqual(['Economic']);
  });

  it('toggles a mechanics-backed chip on its own field', () => {
    const coop = CATEGORY_CHIPS.find((c) => c.label === 'Cooperative')!;
    const s = { ...DEFAULT_SCOPE, ...toggleCategory(DEFAULT_SCOPE, coop) };
    expect(s.mechanics).toEqual(['Cooperative Game']);
    expect(s.categories).toEqual([]);
  });
});

describe('player chips', () => {
  it('offers 1 through 6', () => {
    expect(PLAYER_CHIPS.map((p) => p.bestAt)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('complexity bands', () => {
  it('offers five contiguous, non-overlapping bands', () => {
    expect(COMPLEXITY_BANDS).toHaveLength(5);
    expect(COMPLEXITY_BANDS[0].min).toBeNull();
    expect(COMPLEXITY_BANDS[4].max).toBeNull();
    for (let i = 0; i < COMPLEXITY_BANDS.length - 1; i++) {
      expect(COMPLEXITY_BANDS[i].max).toBe(COMPLEXITY_BANDS[i + 1].min);
    }
  });

  it('is single-select: applying a band replaces the previous one', () => {
    const light = COMPLEXITY_BANDS[0];
    const heavy = COMPLEXITY_BANDS[4];
    let s = { ...DEFAULT_SCOPE, ...bandPatch(DEFAULT_SCOPE, light) };
    expect(isBandOn(s, light)).toBe(true);

    s = { ...s, ...bandPatch(s, heavy) };
    expect(isBandOn(s, heavy)).toBe(true);
    expect(isBandOn(s, light)).toBe(false);
  });

  it('clears the band when the active one is re-clicked', () => {
    const med = COMPLEXITY_BANDS[2];
    let s = { ...DEFAULT_SCOPE, ...bandPatch(DEFAULT_SCOPE, med) };
    s = { ...s, ...bandPatch(s, med) };
    expect(s.weightMin).toBeNull();
    expect(s.weightMax).toBeNull();
    expect(isBandOn(s, med)).toBe(false);
  });
});

describe('complexityLabel and complexityBandIndex', () => {
  it('returns null label and 0 index for null weight', () => {
    expect(complexityLabel(null)).toBeNull();
    expect(complexityBandIndex(null)).toBe(0);
  });

  it('returns null label and 0 index for non-finite weight', () => {
    expect(complexityLabel(NaN)).toBeNull();
    expect(complexityBandIndex(NaN)).toBe(0);
    expect(complexityLabel(Infinity)).toBeNull();
    expect(complexityBandIndex(Infinity)).toBe(0);
  });

  it('labels each band, with boundaries falling in the upper band', () => {
    expect(complexityLabel(1.2)).toBe('Light');
    expect(complexityLabel(2.0)).toBe('Medium-Light');
    expect(complexityLabel(2.5)).toBe('Medium');
    expect(complexityLabel(3.0)).toBe('Medium-Heavy');
    expect(complexityLabel(3.5)).toBe('Heavy');
    expect(complexityLabel(4.9)).toBe('Heavy');
  });

  it('returns matching band index for each boundary value', () => {
    expect(complexityBandIndex(1.2)).toBe(1); // Light
    expect(complexityBandIndex(2.0)).toBe(2); // Medium-Light
    expect(complexityBandIndex(2.5)).toBe(3); // Medium
    expect(complexityBandIndex(3.0)).toBe(4); // Medium-Heavy
    expect(complexityBandIndex(3.5)).toBe(5); // Heavy
    expect(complexityBandIndex(4.9)).toBe(5); // Heavy
  });

  it('agrees on label and step for boundary and below-1 values', () => {
    const testValues = [0.5, 2.0, 2.5, 3.0, 3.5];
    for (const weight of testValues) {
      const label = complexityLabel(weight);
      const index = complexityBandIndex(weight);
      if (label === null) {
        expect(index).toBe(0);
      } else {
        expect(COMPLEXITY_BANDS[index - 1].label).toBe(label);
      }
    }
  });
});
