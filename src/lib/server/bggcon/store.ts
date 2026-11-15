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
	/** Write only if the file doesn't exist yet; false when it already did. */
	create(name: string, value: unknown): Promise<boolean>;
	/** The names of the files under `prefix`. */
	list(prefix: string): Promise<string[]>;
}

const JSON_META = { contentType: 'application/json', cacheControl: 'no-store' };

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
			.save(JSON.stringify(value), { resumable: false, metadata: JSON_META });
	},
	async create(name, value) {
		try {
			await artifactBucket()
				.file(name)
				.save(JSON.stringify(value), {
					resumable: false,
					metadata: JSON_META,
					preconditionOpts: { ifGenerationMatch: 0 }
				});
			return true;
		} catch (e) {
			if ((e as { code?: number }).code === 412) return false;
			throw e;
		}
	},
	async list(prefix) {
		const [files] = await artifactBucket().getFiles({ prefix });
		return files.map((f) => f.name);
	}
};
