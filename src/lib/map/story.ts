/**
 * The guided tour through the embedding map: an ordered list of steps, each a view of the
 * same map plus the prose beside it. The page scrolls the prose; whichever step is in the
 * middle of the viewport drives the map (projection, colour, which games are ringed and
 * labelled, where the camera is). Pure data + two small pure helpers, so the steps can be
 * unit-tested and reordered without touching the page.
 *
 * ALL PROSE HERE IS PLACEHOLDER — a first draft to show the shape of the story; Phil
 * writes the copy. The game ids are BGG ids of well-known titles; a step tolerates any of
 * them being absent from the current artifact (they're just filtered out).
 */
import type { CoordinateSet } from './coordinates';
import type { ViewState } from './view';
import { neighboursOf, type NeighboursArtifact } from './neighbours';

/** BGG ids of the games the tour points at. Names come from the catalog, never from here. */
export const GAMES = {
	brass: 224517,
	codenames: 178900,
	catan: 13,
	gloomhaven: 174430,
	twilightStruggle: 12333,
	ticketToRide: 9209,
	pandemic: 30549,
	wingspan: 266192,
	arkNova: 342942,
	terraformingMars: 167791,
	chess: 171,
	go: 188,
	monopoly: 1406,
	twilightImperium4: 233078,
	asl: 243,
	uno: 2223,
	azul: 230802,
	dominion: 36218,
	root: 237182,
	splendor: 148228,
	carcassonne: 822,
	agricola: 31260,
	game1830: 421,
	ageOfSteam: 4098,
	spiritIsland: 162886,
	justOne: 254640,
	wavelength: 262543,
	kingdomino: 204583,
	candyLand: 5048,
	nemesis: 167355,
	rurik: 228328,
	feastForOdin: 177736,
	forbiddenIsland: 65244,
	imperialAssault: 164153,
	modernArt: 118,
	ra: 12,
	flammeRouge: 199478,
	lordsOfVegas: 20437,
	hotStreak: 446497,
	puertoRico: 3076,
	mexica: 2955,
	skyTeam: 373106,
	arcs: 359871,
	slayTheSpire: 338960,
	wyrmspan: 410201,
	backgammon: 2397,
	stratego: 1917,
	aeonsEnd: 191189,
	werewolf: 925,
	mageKnight: 248562,
	happySalmon: 194626,
	campaignForNorthAfrica: 4815,
	frosthaven: 295770,
	combatCommander: 21050,
	scythe: 169786
} as const;

export interface StoryStep {
	id: string;
	/** PLACEHOLDER copy. */
	title: string;
	/** PLACEHOLDER copy — one paragraph per entry. */
	body: string[];
	/** What changes on the map for this step; unspecified fields fall back to the tour's base view. */
	view: Partial<Omit<ViewState, 'selected'>>;
	/** Games drawn with a label. */
	anchors?: number[];
	/** Ring + label the `n` nearest games to this one (engine cosine, precomputed), and frame them. */
	neighboursOf?: number;
	n?: number;
	/** Restrict the neighbour search to upcoming games. */
	upcomingOnly?: boolean;
	/** Show this game's coordinate vector beside the prose. */
	vectorOf?: number;
	/** Let the reader hover/click the map on this step. Most steps are a picture. */
	interactive?: boolean;
	/** Show one component as a labelled strip instead of the map. */
	strip?: { pc: number; labels: number[]; title: string; poles: [string, string] };
}

/** The view every step starts from; a step overrides what it needs to. */
export const BASE_VIEW: Omit<ViewState, 'selected'> = {
	projection: 'pca',
	x: 1,
	y: 2,
	colour: 'weight',
	size: 'uniform',
	upcoming: false,
	minRatings: 30,
	categories: null
};

export const STEPS: StoryStep[] = [
	{
		id: 'universe',
		title: 'Every board game, on one map',
		body: [
			'Each dot is a game with at least thirty ratings on BoardGameGeek — thirty-odd thousand of them. Two dots close together are games the model thinks are alike; far apart, unalike.',
			'Nothing here was placed by hand. The layout falls out of the numbers that describe each game.'
		],
		view: { colour: 'upcoming', upcoming: false, size: 'uniform' }
	},
	{
		id: 'vector',
		title: 'A game is a list of numbers',
		body: [
			'Before it can be drawn, every game is turned into a fixed-length list of numbers — an embedding. The list is built from what BGG knows about the game: its mechanics, categories, designers, weight, player counts, and the text on its page.',
			'Games that share a lot end up with similar lists. Brass: Birmingham’s list looks like this once it’s been squeezed down to the handful of dimensions the map is drawn from.'
		],
		view: { colour: 'upcoming', upcoming: false, size: 'uniform' },
		anchors: [GAMES.brass],
		vectorOf: GAMES.brass
	},
	{
		id: 'complexity',
		title: 'Left to right is roughly “how heavy”',
		body: [
			'The map’s horizontal axis is the single direction the numbers vary most along. It wasn’t told what that direction means — but colour the dots by BGG’s weight rating and the answer is obvious: light family games sit at one end, heavy strategy games at the other.',
			'That’s the point of an embedding. Structure the model found on its own lines up with things people already care about.'
		],
		view: { colour: 'weight', size: 'uniform' },
		anchors: [
			GAMES.candyLand,
			GAMES.uno,
			GAMES.catan,
			GAMES.wingspan,
			GAMES.brass,
			GAMES.twilightImperium4,
			GAMES.asl
		]
	},
	{
		id: 'strip-weight',
		title: 'One direction at a time',
		body: [
			'Take just that first direction and lay every game out along it. Games you know land where you’d expect: the party games at one end, the long wargames at the other, and the big Euros in between.',
			'The map has many of these directions. Each is a line like this one; the map draws two of them at once.'
		],
		view: { colour: 'weight', size: 'uniform' },
		strip: {
			pc: 1,
			labels: [GAMES.happySalmon, GAMES.codenames, GAMES.catan, GAMES.pandemic, GAMES.wingspan, GAMES.brass, GAMES.gloomhaven, GAMES.twilightImperium4, GAMES.asl],
			title: 'Direction 1 — weight',
			poles: ['light, quick, big groups', 'heavy, long, grognard']
		}
	},
	{
		id: 'strip-modern',
		title: 'A direction the map found on its own',
		body: [
			'The third direction has no obvious name. Laid out, one end is Backgammon, Stratego and Twilight Struggle; the other is Gloomhaven, Spirit Island, Slay the Spire. What it’s picking up is a way of building games — solo-playable, run on a hand of cards, asymmetric — that took over the hobby’s top shelf after about 2015.',
			'It isn’t “old versus new”. Sky Team is from 2023 and sits with the classics: two players, dice, no cards. Modern Art is from 1992 and sits past the middle.'
		],
		view: { colour: 'weight', size: 'uniform' },
		strip: {
			pc: 3,
			labels: [
				GAMES.campaignForNorthAfrica, GAMES.werewolf, GAMES.candyLand, GAMES.stratego, GAMES.combatCommander, GAMES.twilightStruggle, GAMES.skyTeam, GAMES.puertoRico, GAMES.modernArt, GAMES.pandemic,
				GAMES.brass, GAMES.feastForOdin, GAMES.terraformingMars, GAMES.nemesis, GAMES.spiritIsland, GAMES.gloomhaven, GAMES.aeonsEnd
			],
			title: 'Direction 3 — classic form ↔ modern hobby design',
			poles: ['classic form: fixed seats, dice, no cards', 'Kickstarter-era: solo-playable, card engine, asymmetric']
		}
	},
	{
		id: 'genres',
		title: 'Genres gather',
		body: [
			'Colour by category instead and the cloud splits into neighbourhoods. Wargames pull to one side, party games to another; train games and economic games share a corner because they share so much else.',
			'The categories are BGG’s own tags. The model never saw the colours — it put these games near each other because their descriptions and mechanics overlap.'
		],
		view: { colour: 'category', size: 'uniform' },
		anchors: [GAMES.asl, GAMES.justOne, GAMES.game1830, GAMES.chess, GAMES.dominion, GAMES.agricola]
	},
	{
		id: 'rating',
		title: 'Where a game sits says nothing about whether it’s good',
		body: [
			'Colour by geek rating and the pattern mostly dissolves. Highly rated games are scattered everywhere — a little denser at the heavy end, where BGG’s voters live, but there are well-loved light games and forgettable heavy ones.',
			'Position is about what a game is like, not how much people like it. That separation is what makes the map useful for finding things.'
		],
		view: { colour: 'geek', size: 'popularity' },
		anchors: [GAMES.brass, GAMES.gloomhaven, GAMES.codenames, GAMES.monopoly]
	},
	{
		id: 'neighbours',
		title: '“Similar games” means “nearest dots”',
		body: [
			'Ask for games like Brass: Birmingham and the engine does the simplest thing possible: it measures the distance from Brass to every other game and returns the closest.',
			'Zoomed in, that’s the ring of games around it. Economic games with tight networks, routes and money — no rules were written to say so.'
		],
		view: { colour: 'weight', size: 'uniform' },
		neighboursOf: GAMES.brass,
		n: 12,
		interactive: true
	},
	{
		id: 'neighbours-2',
		title: 'Same trick, other end of the map',
		body: [
			'Codenames lives in a very different corner. Its nearest neighbours are other word and party games — again, purely because their numbers are close.',
			'Every “similar games” list on this site is a neighbourhood like this one.'
		],
		view: { colour: 'weight', size: 'uniform' },
		neighboursOf: GAMES.codenames,
		n: 12,
		interactive: true
	},
	{
		id: 'umap',
		title: 'Another way to flatten it',
		body: [
			'The map so far shows two of the many dimensions in each game’s list, so a lot of the closeness is hidden. UMAP is a different flattening that tries to keep every game near its true neighbours, at the cost of the axes meaning anything.',
			'The same Codenames neighbourhood, seen through UMAP. The clusters get tighter; the big picture gets blobbier.'
		],
		view: { projection: 'umap', colour: 'category', size: 'uniform' },
		neighboursOf: GAMES.codenames,
		n: 12,
		interactive: true
	},
	{
		id: 'upcoming',
		title: 'New games land somewhere too',
		body: [
			'A game announced for next year already has a page, a description and a designer, so it already has a list of numbers — and a spot on the map, before anyone has rated it.',
			'Which means you can ask: what’s coming that sits near Brass? These are the unreleased games nearest to it.'
		],
		view: { colour: 'upcoming', upcoming: true, size: 'uniform' },
		neighboursOf: GAMES.brass,
		n: 10,
		upcomingOnly: true
	},
	{
		id: 'explore',
		title: 'Go and look around',
		body: [
			'That’s the whole idea. The full map lets you pick the axes, colour by whatever you like, find any game and see what surrounds it.'
		],
		view: { colour: 'weight', size: 'popularity', upcoming: true },
		interactive: true
	}
];

/** Resolve a step to the concrete view, anchors and selection for the map. */
export function resolveStep(
	step: StoryStep,
	coords: CoordinateSet,
	neighbours: NeighboursArtifact
): { view: ViewState; anchors: number[]; focus: number[] | null } {
	const has = (id: number) => coords.index.has(id);
	let selected: number[] = [];
	let focus: number[] | null = null;
	if (step.neighboursOf !== undefined && has(step.neighboursOf)) {
		selected = neighboursOf(neighbours, step.neighboursOf, step.n ?? 10, step.upcomingOnly).filter(has);
		focus = [step.neighboursOf, ...selected];
	}
	const anchors = [
		...(step.anchors ?? []),
		...(step.neighboursOf !== undefined ? [step.neighboursOf] : [])
	].filter(has);
	return { view: { ...BASE_VIEW, ...step.view, selected }, anchors, focus };
}
