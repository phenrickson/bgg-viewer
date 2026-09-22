/**
 * Read the catalog artifact pointer from GCS and hand the browser a signed URL for it.
 *
 * The artifact is built by `scripts/build-catalog-artifact.ts` in CI and stored under a
 * content-hashed name, with `catalog-current.json` naming the current hash. This module is
 * the read side: resolve the pointer, sign a URL, let the browser fetch the bytes straight
 * from GCS. The Cloud Run process never holds the 5.25 MB.
 *
 * All of the mechanism — the pointer cache, v2 signing, the 24h window anchoring and the
 * staleness warning — now lives in `../artifact-pointer`, which thumbnails uses too. This
 * module is the catalog's instance of it, kept as its own file so `/api/catalog` and its
 * tests import the catalog's names rather than reaching for the factory directly.
 *
 * The auth gate does not live here — `/api/catalog` still checks `locals.user` before
 * calling any of this. The bucket is private; a signed URL is the only way in.
 */
import { createArtifactPointer, type ArtifactPointer, type SignedArtifact } from '../artifact-pointer';

export type CatalogPointer = ArtifactPointer;
export type SignedCatalog = SignedArtifact;

const pointer = createArtifactPointer({ pointerName: 'catalog-current.json', label: 'catalog' });

export const getCatalogPointer = pointer.getPointer;
export const getSignedCatalog = pointer.getSignedArtifact;

/** Test seam. */
export const _resetPointerCache = pointer.reset;
