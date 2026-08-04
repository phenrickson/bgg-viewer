/**
 * The warm-gap content, typed.
 *
 * A JSON import widens string literals — `kind` comes back as `string`, not `'scatter'` —
 * so the discriminated union in `types.ts` cannot narrow against the raw module. Asserting
 * once here means every consumer gets a real `Viz` and no one has to repeat the cast.
 *
 * The assertion is load-bearing rather than cosmetic: `content.json` is machine-written by
 * `scripts/build-landing-content.js`, and `content.test.ts` is what actually checks its
 * shape. This file states the contract; that test enforces it.
 */
import raw from './content.json';
import type { LandingContent } from './types';

export const landingContent = raw as unknown as LandingContent;
