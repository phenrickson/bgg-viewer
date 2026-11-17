/**
 * The /bggcon/analytics activity views, derived from the warehouse's 15-minute buckets
 * (spec: docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md).
 *
 * Everything is shown in Chicago time. An hour counts only once it's complete (it ended at or
 * before `as_of`), so the current hour never looks like a drop. The library closes at midnight,
 * so the per-hour views run 8 AM to 11 PM.
 */
import type { BggconActivity } from '$lib/server/warehouse/types';

export const CON_DAYS = [
	{ day: 'Tue', date: 17 },
	{ day: 'Wed', date: 18 },
	{ day: 'Thu', date: 19 },
	{ day: 'Fri', date: 20 },
	{ day: 'Sat', date: 21 },
	{ day: 'Sun', date: 22 }
] as const;
/** The library days (Tue is the recorder's test day). */
export const LIBRARY_DAYS = CON_DAYS.slice(1);
/** Hours of the day the per-hour views cover (8 AM–11 PM). */
export const HOURS = Array.from({ length: 16 }, (_, i) => i + 8);

const HOUR_MS = 60 * 60 * 1000;
const fmt = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/Chicago',
	weekday: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric',
	hourCycle: 'h23'
});

export type ChicagoTime = { day: string; date: number; hour: number; minute: number };

export function chicago(iso: string): ChicagoTime {
	const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
	return { day: p.weekday, date: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
}

/** Checkouts per Chicago (date, hour), with whether that hour is complete and open. */
function hourly(a: BggconActivity) {
	const asOf = a.as_of ? Date.parse(a.as_of) : -Infinity;
	const hours = new Map<string, { date: number; hour: number; checkouts: number; start: number }>();
	for (const b of a.buckets) {
		const t = chicago(b.start);
		const key = `${t.date}-${t.hour}`;
		const start = Date.parse(b.start) - t.minute * 60_000;
		const h = hours.get(key) ?? { date: t.date, hour: t.hour, checkouts: 0, start };
		h.checkouts += b.checkouts;
		hours.set(key, h);
	}
	return [...hours.values()].map((h) => ({
		...h,
		complete: h.start + HOUR_MS <= asOf,
		open: isOpen(a, new Date(h.start).toISOString())
	}));
}

export function isOpen(a: BggconActivity, iso: string): boolean {
	const t = Date.parse(iso);
	return a.hours.some((w) => Date.parse(w.open) <= t && t < Date.parse(w.close));
}

export function kpis(a: BggconActivity): {
	total: number;
	lastHour: number;
	busiest: { day: string; hour: number; checkouts: number } | null;
} {
	const total = a.buckets.reduce((s, b) => s + b.checkouts, 0);
	const asOf = a.as_of ? Date.parse(a.as_of) : null;
	const lastHour =
		asOf === null
			? 0
			: a.buckets
					.filter((b) => Date.parse(b.start) > asOf - HOUR_MS && Date.parse(b.start) <= asOf)
					.reduce((s, b) => s + b.checkouts, 0);
	const best = hourly(a)
		.filter((h) => h.complete && h.checkouts > 0)
		.sort((x, y) => y.checkouts - x.checkouts || x.start - y.start)[0];
	const busiest = best
		? { day: CON_DAYS.find((d) => d.date === best.date)?.day ?? '', hour: best.hour, checkouts: best.checkouts }
		: null;
	return { total, lastHour, busiest };
}

/** Total checkouts per day, Tue–Sun: `null` for days not reached yet, `partial` for today. */
export function byDay(a: BggconActivity): { day: string; checkouts: number | null; partial: boolean }[] {
	const today = a.as_of ? chicago(a.as_of).date : null;
	return CON_DAYS.map(({ day, date }) => {
		if (today === null || date > today) return { day, checkouts: null, partial: false };
		const checkouts = a.buckets.filter((b) => chicago(b.start).date === date).reduce((s, b) => s + b.checkouts, 0);
		return { day, checkouts, partial: date === today };
	});
}

/** Average checkouts in each hour of the day, over library days with that hour complete and open. */
export function averageByHour(a: BggconActivity): { hour: number; average: number }[] {
	const hs = hourly(a).filter((h) => h.complete && h.open);
	return HOURS.flatMap((hour) => {
		const xs = hs.filter((h) => h.hour === hour);
		return xs.length ? [{ hour, average: xs.reduce((s, h) => s + h.checkouts, 0) / xs.length }] : [];
	});
}

/** Each library day's checkouts per complete, open hour (8 AM–11 PM). */
export function eachDay(a: BggconActivity): { day: string; points: { hour: number; checkouts: number }[] }[] {
	const hs = hourly(a).filter((h) => h.complete && h.open);
	return LIBRARY_DAYS.map(({ day, date }) => ({
		day,
		points: hs
			.filter((h) => h.date === date && HOURS.includes(h.hour))
			.sort((x, y) => x.hour - y.hour)
			.map((h) => ({ hour: h.hour, checkouts: h.checkouts }))
	}));
}
