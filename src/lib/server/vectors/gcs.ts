/** The vectors artifact's GCS pointer (`vectors-current.json`), signed for the browser. */
import { createArtifactPointer, type ArtifactPointer, type SignedArtifact } from '../artifact-pointer';

export type VectorsPointer = ArtifactPointer;
export type SignedVectors = SignedArtifact;

const pointer = createArtifactPointer({
	pointerName: 'vectors-current.json',
	label: 'vectors'
});

export const getVectorsPointer = pointer.getPointer;
export const getSignedVectors = pointer.getSignedArtifact;

export const _resetPointerCache = pointer.reset;
