import { describe, expect, it } from 'vitest';
import {
	explain,
	whyLine,
	complexityText,
	playersText,
	playtimeText,
	isEmbeddingFamily,
	type WhyRow,
	type TagFrequencies
} from './why';

const row = (over: Partial<WhyRow> = {}): WhyRow => ({
	predicted_complexity: 3.5,
	min_players: 2,
	max_players: 4,
	min_playtime: 60,
	max_playtime: 90,
	mechanics: [],
	categories: [],
	families: [],
	...over
});

const freq = (m: Record<string, number> = {}): TagFrequencies => {
	const map = new Map(Object.entries(m));
	return { mechanics: map, categories: map, families: map };
};

describe('explain — scalars', () => {
	it('reads close predicted complexity as "both ~X"', () => {
		const w = explain(row({ predicted_complexity: 3.7 }), row({ predicted_complexity: 3.9 }), freq());
		expect(w.complexity?.close).toBe(true);
		expect(complexityText(w.complexity!)).toBe('both ~3.8');
	});

	it('reads distant complexity as a contrast', () => {
		const w = explain(row({ predicted_complexity: 3.8 }), row({ predicted_complexity: 2.9 }), freq());
		expect(w.complexity?.close).toBe(false);
		expect(complexityText(w.complexity!)).toBe('3.8 vs 2.9');
	});

	it('uses box player ranges and their overlap', () => {
		const w = explain(row({ min_players: 1, max_players: 4 }), row({ min_players: 2, max_players: 5 }), freq());
		expect(w.players?.overlap).toEqual([2, 4]);
		expect(playersText(w.players!)).toBe('both play 2–4');
	});

	it('says when player ranges do not meet', () => {
		const w = explain(row({ min_players: 1, max_players: 2 }), row({ min_players: 3, max_players: 6 }), freq());
		expect(w.players?.overlap).toBeNull();
		expect(playersText(w.players!)).toBe('1–2 vs 3–6');
	});

	it('fills a missing end from the other and drops play time when a game lists none', () => {
		const w = explain(
			row({ min_playtime: null, max_playtime: 60 }),
			row({ min_playtime: 45, max_playtime: 45 }),
			freq()
		);
		expect(w.playtime?.a).toEqual([60, 60]);
		expect(playtimeText(w.playtime!)).toBe('1h vs 45 min');
		expect(explain(row(), row({ min_playtime: null, max_playtime: null }), freq()).playtime).toBeNull();
	});
});

describe('explain — shared tags', () => {
	it('lists shared tags rarest first', () => {
		const w = explain(
			row({ mechanics: ['Hand Management', 'Network and Route Building', 'Solo'] }),
			row({ mechanics: ['Network and Route Building', 'Hand Management'] }),
			freq({ 'Hand Management': 9000, 'Network and Route Building': 700, Solo: 50 })
		);
		expect(w.shared.mechanics).toEqual(['Network and Route Building', 'Hand Management']);
	});

	it('drops tags on fewer than 10 games, as the model does', () => {
		const w = explain(
			row({ categories: ['Tiny', 'Economic'] }),
			row({ categories: ['Tiny', 'Economic'] }),
			freq({ Tiny: 3, Economic: 4000 })
		);
		expect(w.shared.categories).toEqual(['Economic']);
	});

	it('keeps only families under the embedding allowlist', () => {
		const fams = ['Players: Two-Player Only Games', 'Crowdfunding: Kickstarter', 'Misc: LongPack Games'];
		const w = explain(row({ families: fams }), row({ families: fams }), freq({ [fams[0]]: 5000, [fams[1]]: 6000, [fams[2]]: 1500 }));
		expect(w.shared.families).toEqual(['Players: Two-Player Only Games']);
		expect(isEmbeddingFamily('Theme: Trains')).toBe(false);
		expect(isEmbeddingFamily('Card Games: Trick-taking')).toBe(true);
	});

	it('shows tags unfiltered while the counts have not loaded', () => {
		const w = explain(row({ mechanics: ['A'] }), row({ mechanics: ['A'] }), freq());
		expect(w.shared.mechanics).toEqual(['A']);
	});
});

describe('whyLine', () => {
	it('takes two matching traits then the rarest shared mechanic', () => {
		const w = explain(
			row({ predicted_complexity: 3.7, mechanics: ['Hand Management', 'Network and Route Building'] }),
			row({ predicted_complexity: 3.9, mechanics: ['Hand Management', 'Network and Route Building'] }),
			freq({ 'Hand Management': 9000, 'Network and Route Building': 700 })
		);
		expect(whyLine(w)).toEqual(['Both ~3.8', '2–4 players', 'Network and Route Building']);
	});

	it('skips traits that do not match', () => {
		const w = explain(
			row({ predicted_complexity: 1.5, min_players: 1, max_players: 1 }),
			row({ predicted_complexity: 4, min_players: 3, max_players: 5 }),
			freq()
		);
		expect(whyLine(w)).toEqual(['1h–1h 30']);
	});
});
