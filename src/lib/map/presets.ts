/**
 * Pre-configured plots — a named set of filters and encodings, authored here.
 *
 * The map can express a great many views and almost none of them are discoverable by
 * turning six controls one at a time. A preset is the answer to "what is this thing FOR":
 * someone else has already found the view worth looking at, and the controls are there to
 * take it further once you have arrived somewhere interesting.
 *
 * **A preset is a partial, not a whole.** Applying one starts from the defaults and lays the
 * preset over the top, so a preset says only what it means and inherits everything else.
 * That matters when a field is added: an existing preset keeps working and simply gets the
 * new default, rather than silently asserting a value its author never considered.
 *
 * **Typed partials rather than querystrings.** A preset could have been stored as the URL it
 * produces, which would guarantee it round-trips exactly like a shared link — but a renamed
 * or retyped field would then fail silently at parse time, falling back to a default and
 * quietly changing what the preset shows. As `Partial<Scope>` and `Partial<ViewState>` the
 * same rename is a compile error. The URL is still how a preset is *shared*; it just isn't
 * how it's stored.
 */
import { DEFAULT_SCOPE, type Scope } from '$lib/catalog/scope';
import { DEFAULT_VIEW, type ViewState } from './view';

export interface Preset {
	/** Stable identifier — appears in the URL, so renaming one breaks existing links. */
	id: string;
	/** What it's called in the list. */
	name: string;
	/** One line under the name: what this view shows, not how it was built. */
	blurb: string;
	/** Filters. Omitted fields keep `DEFAULT_SCOPE`. */
	scope?: Partial<Scope>;
	/** Encodings. Omitted fields keep `DEFAULT_VIEW`. */
	view?: Partial<ViewState>;
}

/**
 * PLACEHOLDER COPY (Phil): every `name` and `blurb` below is a stand-in, and the SET is a
 * stand-in too — these exist to prove the mechanism and to be replaced by the views you
 * actually want people to land on.
 *
 * What a preset CAN say today: any filter `Scope` expresses, plus every encoding — a PCA
 * component pair, UMAP, or a single component as a strip, with colour and size.
 *
 * What it cannot: an axis taken from a catalog fact rather than from the embedding. `weight
 * x rating`, `year x geek`. `factProjection` already produces those and `MapLayer` already
 * accepts a `projection` prop that overrides, so the renderer needs nothing; what is missing
 * is a way to SAY you want one, since `ViewState` is pinned to five keys by a test. Once
 * that lands, those are the presets most worth having.
 */
export const PRESETS: Preset[] = [
	{
		id: 'landscape',
		name: 'The whole landscape',
		blurb: 'Every rated game, coloured by weight.',
		view: { projection: 'pca', x: 1, y: 2, colour: 'weight' }
	},
	{
		id: 'neighbourhoods',
		name: 'Neighbourhoods',
		blurb: 'UMAP, coloured by category — the clusters the embedding found.',
		view: { projection: 'umap', colour: 'category' }
	},
	{
		id: 'wargames',
		name: 'Wargames',
		blurb: 'Where wargames sit in the whole of board games.',
		scope: { categories: ['Wargame'] },
		view: { colour: 'year' }
	},
	{
		id: 'upcoming',
		name: 'Not out yet',
		blurb: 'Games published this year or later, against the established landscape.',
		scope: { universe: 'upcoming' },
		view: { colour: 'upcoming', size: 'uniform' }
	},
	{
		id: 'heavy',
		name: 'The heavy end',
		blurb: 'Complexity 3.5 and up, coloured by rating.',
		scope: { weightMin: 3.5 },
		view: { colour: 'rating' }
	}
];

export function presetById(id: string): Preset | undefined {
	return PRESETS.find((p) => p.id === id);
}

/**
 * The scope and view a preset means, resolved against the defaults.
 *
 * Returns fresh objects every call: the caller assigns these straight into reactive state,
 * and handing out a shared reference would let one applied preset be mutated by the controls
 * and then reapply differently next time.
 */
export function applyPreset(preset: Preset): { scope: Scope; view: ViewState } {
	return {
		scope: { ...DEFAULT_SCOPE, ...preset.scope },
		view: { ...DEFAULT_VIEW, ...preset.view }
	};
}

/**
 * Is `scope`/`view` still showing what `preset` asked for?
 *
 * Compares the FULL resolved state rather than only the fields the preset names. A preset
 * that sets nothing but a colour still stops being "what you are looking at" once you filter
 * to wargames, and highlighting it in the list would be a lie about what is on screen.
 */
export function matchesPreset(preset: Preset, scope: Scope, view: ViewState): boolean {
	const want = applyPreset(preset);
	return same({ ...want.scope }, { ...scope }) && same({ ...want.view }, { ...view });
}

function same(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const k of keys) {
		const x = a[k];
		const y = b[k];
		if (Array.isArray(x) || Array.isArray(y)) {
			const xa = Array.isArray(x) ? x : [];
			const ya = Array.isArray(y) ? y : [];
			if (xa.length !== ya.length || xa.some((v, i) => v !== ya[i])) return false;
		} else if (x !== y) {
			return false;
		}
	}
	return true;
}
