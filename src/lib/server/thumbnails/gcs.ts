/**
 * Read the thumbnails artifact pointer from GCS and hand the browser a signed URL for it.
 *
 * The catalog's instance of `../artifact-pointer`, one artifact over. Built by
 * `scripts/build-thumbnails-artifact.ts` in CI, stored content-hashed, with
 * `thumbnails-current.json` naming the current hash.
 *
 * The auth gate does not live here — `/api/thumbnails` checks `locals.user` first. The
 * bucket is private; a signed URL is the only way in.
 */
import { createArtifactPointer, type ArtifactPointer, type SignedArtifact } from '../artifact-pointer';

export type ThumbnailsPointer = ArtifactPointer;
export type SignedThumbnails = SignedArtifact;

const pointer = createArtifactPointer({
	pointerName: 'thumbnails-current.json',
	label: 'thumbnails'
});

export const getThumbnailsPointer = pointer.getPointer;
export const getSignedThumbnails = pointer.getSignedArtifact;

/** Test seam. */
export const _resetPointerCache = pointer.reset;
