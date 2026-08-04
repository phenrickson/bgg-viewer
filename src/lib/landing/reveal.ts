/**
 * Reveal a section as it enters the viewport.
 *
 * The warm-gap sections run down the foot of the landing page, and a static wall of them
 * reads as filler. Fading each one in as you reach it makes the page feel like it unfolds —
 * which is the point, since scrolling through them IS the thing to do while the catalog loads.
 *
 * `once: true` — re-animating on the way back up is a distraction, not a delight.
 *
 * Motion is opt-out at the source rather than only in CSS: when the user has asked for reduced
 * motion there is no observer at all, and the element is simply visible from the start. A
 * CSS-only opt-out still pays for the observer and still starts the element at `opacity: 0`,
 * which is a blank section for anyone whose IntersectionObserver never fires.
 */
export function reveal(node: HTMLElement) {
	const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	if (reduced || typeof IntersectionObserver === 'undefined') {
		node.classList.add('revealed');
		return;
	}

	node.classList.add('reveal-pending');
	const io = new IntersectionObserver(
		([entry]) => {
			if (!entry.isIntersecting) return;
			node.classList.remove('reveal-pending');
			node.classList.add('revealed');
			io.disconnect();
		},
		// A little margin so the section is already settled by the time it is properly in view,
		// rather than animating under the user's eyes.
		{ rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
	);
	io.observe(node);

	return { destroy: () => io.disconnect() };
}
