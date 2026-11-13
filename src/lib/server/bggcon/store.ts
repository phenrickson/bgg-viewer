/**
 * Small JSON files under `bggcon/` in the artifacts bucket: the library snapshot and each
 * user's stars. The app may write only there; a conditioned grant in bgg-data-warehouse
 * (`bgg_viewer_bggcon_writer`, terraform/viewer.tf) enforces that.
 *
 * Note the bucket's 30-day lifecycle rule: a file is deleted 30 days after its last write.
 */
import { artifactBucket } from '../artifact-pointer';

export interface JsonStore {
	/** The parsed file, or null when it doesn't exist. */
	read<T>(name: string): Promise<T | null>;
	write(name: string, value: unknown): Promise<void>;
}

export const gcsStore: JsonStore = {
	async read<T>(name: string): Promise<T | null> {
		try {
			const [buf] = await artifactBucket().file(name).download();
			return JSON.parse(buf.toString('utf-8')) as T;
		} catch (e) {
			if ((e as { code?: number }).code === 404) return null;
			throw e;
		}
	},
	async write(name, value) {
		await artifactBucket()
			.file(name)
			.save(JSON.stringify(value), {
				resumable: false,
				metadata: { contentType: 'application/json', cacheControl: 'no-store' }
			});
	}
};
