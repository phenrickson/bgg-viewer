/**
 * A user's phone-alert topic: the ntfy topic the recorder pushes their focus-list alerts to
 * (spec §8). Made once and kept in `bggcon/alerts/{user_id}.json` = `{"topic": "…"}`, beside
 * their stars file rather than inside it, so the stars format the recorder reads stays the same.
 *
 * Topics are easy to type rather than secret (accepted for a small group): the BGG username
 * when there is one, otherwise two words and a number. Never an email, since topic names pass
 * through ntfy.sh's public server.
 */
import type { SessionUser } from '../auth/session';
import { gcsStore, type JsonStore } from './store';

const PREFIX = 'bggcon-2026-';
const ALERTS_DIR = 'bggcon/alerts/';
/** ntfy's limit on a topic name. */
const MAX_TOPIC = 64;

const ADJECTIVES = [
	'amber', 'azure', 'bold', 'brave', 'brisk', 'calm', 'clever', 'cosy', 'crimson', 'daring',
	'eager', 'fancy', 'fuzzy', 'gentle', 'gilded', 'golden', 'grand', 'happy', 'hidden', 'jolly',
	'keen', 'lucky', 'lunar', 'merry', 'mighty', 'misty', 'noble', 'olive', 'plucky', 'polar',
	'quick', 'quiet', 'rapid', 'royal', 'rustic', 'scarlet', 'shiny', 'silver', 'sly', 'snowy',
	'sunny', 'swift', 'tidy', 'tiny', 'velvet', 'vivid', 'witty', 'zesty'
];
const NOUNS = [
	'badger', 'beaver', 'bishop', 'castle', 'comet', 'dice', 'dragon', 'falcon', 'ferret', 'fox',
	'gecko', 'goose', 'heron', 'island', 'jackal', 'knight', 'koala', 'lantern', 'lemur', 'llama',
	'magpie', 'meeple', 'moose', 'newt', 'otter', 'owl', 'panda', 'pawn', 'puffin', 'quokka',
	'raven', 'robin', 'rook', 'salmon', 'shrew', 'sloth', 'squid', 'stoat', 'thistle', 'tiger',
	'token', 'tower', 'turtle', 'walrus', 'weasel', 'whale', 'yak', 'zebra'
];

/** The user id becomes part of an object path, so it may not contain anything path-like. */
export function alertsName(userId: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error('invalid user id');
	return `${ALERTS_DIR}${userId}.json`;
}

function words(rand: () => number): string {
	const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
	return `${PREFIX}${pick(ADJECTIVES)}-${pick(NOUNS)}-${10 + Math.floor(rand() * 90)}`;
}

/** From the BGG username when anything usable is left of it, otherwise words and a number. */
export function topicFor(bggUsername: string | null, rand: () => number = Math.random): string {
	const name = (bggUsername ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
	if (!/[a-z0-9]/.test(name)) return words(rand);
	return (PREFIX + name).slice(0, MAX_TOPIC);
}

/** Whether a file other than `own` under bggcon/alerts/ already holds `topic`. */
async function taken(topic: string, own: string, store: JsonStore): Promise<boolean> {
	for (const name of await store.list(ALERTS_DIR)) {
		if (name === own) continue;
		if ((await store.read<{ topic?: string }>(name))?.topic === topic) return true;
	}
	return false;
}

/** The user's topic, made and saved on first use. */
export async function getTopic(
	user: SessionUser,
	store: JsonStore = gcsStore,
	rand: () => number = Math.random
): Promise<string> {
	const name = alertsName(user.user_id);
	const saved = await store.read<{ topic?: string }>(name);
	if (saved?.topic) return saved.topic;

	let topic = topicFor(user.bgg_username, rand);
	// Two accounts with one BGG username: the second gets words, so nobody gets another's alerts.
	if (await taken(topic, name, store)) topic = words(rand);
	if (await store.create(name, { topic })) return topic;

	// Another tab saved first: show that one, so both tabs show the same topic.
	const won = await store.read<{ topic?: string }>(name);
	if (!won?.topic) throw new Error('alerts file exists without a topic');
	return won.topic;
}
