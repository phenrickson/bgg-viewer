import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('runs once, on the trailing edge, with the last arguments', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d('c');
		d('co');
		d('cos');
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		// The point of trailing-edge: the query that runs is the one for what you finished
		// typing, not the one for the first character.
		expect(fn).toHaveBeenCalledWith('cos');
	});

	it('restarts the wait on every call rather than firing at a fixed cadence', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d('a');
		vi.advanceTimersByTime(80);
		d('b');
		vi.advanceTimersByTime(80);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(20);
		expect(fn).toHaveBeenCalledExactlyOnceWith('b');
	});

	it('cancel drops a pending call', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d('x');
		d.cancel();
		vi.advanceTimersByTime(1000);
		expect(fn).not.toHaveBeenCalled();
	});

	it('is reusable after firing', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d('one');
		vi.advanceTimersByTime(100);
		d('two');
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(fn).toHaveBeenLastCalledWith('two');
	});
});
