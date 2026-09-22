import { describe, it, expect } from 'vitest';
import { PRESETS, presetById, applyPreset, matchesPreset } from './presets';
import { DEFAULT_SCOPE } from '$lib/catalog/scope';
import { DEFAULT_VIEW } from './view';

describe('presets', () => {
	it('every preset has a unique id', () => {
		const ids = PRESETS.map((p) => p.id);
		// Ids appear in the URL, so a duplicate would make one preset unreachable.
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('a preset says only what it means and inherits the rest', () => {
		const { scope, view } = applyPreset({
			id: 'x',
			name: 'x',
			blurb: 'x',
			view: { colour: 'year' }
		});
		expect(view.colour).toBe('year');
		// Everything it did not name is the default, not undefined.
		expect(view.projection).toBe(DEFAULT_VIEW.projection);
		expect(view.size).toBe(DEFAULT_VIEW.size);
		expect(scope).toEqual(DEFAULT_SCOPE);
	});

	it('returns fresh objects, so an applied preset cannot be mutated through', () => {
		const p = PRESETS[0];
		const a = applyPreset(p);
		const b = applyPreset(p);
		expect(a.scope).not.toBe(b.scope);
		expect(a.view).not.toBe(b.view);
		a.view.colour = 'geek';
		expect(applyPreset(p).view.colour).not.toBe('geek');
	});

	it('matches a preset against the state it produces', () => {
		for (const p of PRESETS) {
			const { scope, view } = applyPreset(p);
			expect(matchesPreset(p, scope, view)).toBe(true);
		}
	});

	it('stops matching once you change something the preset did not name', () => {
		const p = presetById('neighbourhoods');
		expect(p).toBeDefined();
		const { scope, view } = applyPreset(p!);
		// The preset says nothing about categories, but filtering still means you are no
		// longer looking at what it describes.
		expect(matchesPreset(p!, { ...scope, categories: ['Wargame'] }, view)).toBe(false);
		expect(matchesPreset(p!, scope, { ...view, size: 'uniform' })).toBe(false);
	});

	it('compares array fields by contents, not identity', () => {
		const p = presetById('wargames');
		expect(p).toBeDefined();
		const { scope, view } = applyPreset(p!);
		expect(matchesPreset(p!, { ...scope, categories: ['Wargame'] }, view)).toBe(true);
		expect(matchesPreset(p!, { ...scope, categories: ['Wargame', 'Economic'] }, view)).toBe(false);
	});

	it('presetById is undefined for an unknown id', () => {
		expect(presetById('nope')).toBeUndefined();
	});
});
