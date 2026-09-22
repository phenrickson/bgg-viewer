/**
 * Read the coordinates artifact pointer from GCS and hand the browser a signed URL for it.
 *
 * A third instance of `../artifact-pointer`, after the catalog and thumbnails. Built by
 * `scripts/build-coordinates-artifact.ts` in CI, stored content-hashed, with
 * `coordinates-current.json` naming the current hash.
 *
 * This is the artifact the rail was generalised for: `K_COMPONENTS` is expected to rise
 * (the ceiling is `embedding_8`'s width), and widening a separate artifact costs only the
 * sessions that open the map, where widening the catalog would tax every user for a page
 * most sessions never open.
 *
 * The auth gate does not live here — `/api/coordinates` checks `locals.user` first.
 */
import { createArtifactPointer, type ArtifactPointer, type SignedArtifact } from '../artifact-pointer';

export type CoordinatesPointer = ArtifactPointer;
export type SignedCoordinates = SignedArtifact;

const pointer = createArtifactPointer({
	pointerName: 'coordinates-current.json',
	label: 'coordinates'
});

export const getCoordinatesPointer = pointer.getPointer;
export const getSignedCoordinates = pointer.getSignedArtifact;

/** Test seam. */
export const _resetPointerCache = pointer.reset;
