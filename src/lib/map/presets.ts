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
	/**
	 * Draw ONLY the games in scope, and frame them.
	 *
	 * Normally the map draws every game the artifact carries and dims the ones out of scope,
	 * so you can see where a set sits in the whole. That is wrong for a plot of catalog
	 * quantities: the artifact carries ~5,250 upcoming games with fewer than 30 ratings, whose
	 * average rating is three people's opinion, and they sit in the middle of a rating plot
	 * looking like data.
	 */
	onlyInScope?: boolean;
}

/**
 * The seven views, from Phil's list. `name` and `blurb` are SHORTHAND FOR REVIEW — the
 * mechanism is settled, the wording is not.
 *
 * Five plot the embedding (UMAP or a PCA pair) and differ only in what colour and size say.
 * The last two plot catalog quantities instead, which is what the `facts` projection is
 * for: position stops being the embedding's and becomes any column the catalog carries.
 */
export const PRESETS: Preset[] = [
	{
		id: 'umap-category',
		name: 'Neighbourhoods',
		blurb: 'UMAP, coloured by category.',
		view: { projection: 'umap', colour: 'category', size: 'uniform' }
	},
	{
		id: 'umap-year',
		name: 'Old and new',
		blurb: 'UMAP, coloured by year released.',
		view: { projection: 'umap', colour: 'year', size: 'uniform' }
	},
	{
		id: 'umap-geek',
		name: 'Where the good ones are',
		blurb: 'UMAP, sized by popularity, coloured by geek rating.',
		view: { projection: 'umap', colour: 'geek', size: 'popularity' }
	},
	{
		id: 'pca-geek',
		name: 'The landscape by rating',
		blurb: 'PC1 x PC2, sized by popularity, coloured by geek rating.',
		view: { projection: 'pca', x: 1, y: 2, colour: 'geek', size: 'popularity' }
	},
	{
		id: 'pca-weight',
		name: 'Light to heavy',
		// PLACEHOLDER (Phil): what PC1 and PC2 actually separate is yours to say — I can
		// describe the encoding but not what the axes mean.
		blurb: 'PC1 x PC2, sized by popularity, coloured by weight.',
		view: { projection: 'pca', x: 1, y: 2, colour: 'weight', size: 'popularity' }
	},
	{
		id: 'rating-weight',
		name: 'Does heavier mean better?',
		blurb: 'Average rating against complexity, sized by popularity.',
		view: { projection: 'facts', xFact: 'weight', yFact: 'rating', size: 'popularity' },
		onlyInScope: true
	},
	{
		id: 'rating-popularity',
		name: 'Loved vs played',
		// Axes flipped: rating on x, how many rated it on y. The question is which games earn a
		// high geek rating, so rating is the quantity being read along, not the one read up.
		blurb: 'Average rating against how many people rated it, coloured by geek rating.',
		view: { projection: 'facts', xFact: 'rating', yFact: 'ratings', colour: 'geek', size: 'uniform' },
		onlyInScope: true
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
