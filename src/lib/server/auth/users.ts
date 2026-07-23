/**
 * User repository over the shared `core.users` table in BigQuery — the same table
 * dash-viewer uses, so existing accounts work unchanged. Read path runs only at
 * login/register, never per request (the session cookie carries identity).
 */
import { BigQuery } from '@google-cloud/bigquery';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

export interface DbUser {
	user_id: string;
	email: string;
	password_hash: string;
	display_name: string | null;
	is_active: boolean;
}

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const DATASET = 'core';

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}
const TABLE = `\`${PROJECT}.${DATASET}.users\``;

export async function getUserByEmail(email: string): Promise<DbUser | null> {
	const [rows] = await bq().query({
		query: `SELECT user_id, email, password_hash, display_name, is_active
		        FROM ${TABLE} WHERE LOWER(email) = LOWER(@email) LIMIT 1`,
		params: { email }
	});
	const r = rows[0];
	if (!r) return null;
	return {
		user_id: r.user_id,
		email: r.email,
		password_hash: r.password_hash,
		display_name: r.display_name ?? null,
		is_active: !!r.is_active
	};
}

export async function createUser(input: {
	email: string;
	passwordHash: string;
	displayName: string | null;
}): Promise<DbUser> {
	const user_id = randomUUID();
	await bq().query({
		query: `INSERT INTO ${TABLE} (user_id, email, password_hash, display_name, created_at, is_active)
		        VALUES (@user_id, @email, @password_hash, @display_name, CURRENT_TIMESTAMP(), TRUE)`,
		params: {
			user_id,
			email: input.email,
			password_hash: input.passwordHash,
			display_name: input.displayName
		},
		types: { display_name: 'STRING' } // null needs an explicit type hint
	});
	return {
		user_id,
		email: input.email,
		password_hash: input.passwordHash,
		display_name: input.displayName,
		is_active: true
	};
}

export async function updateLastLogin(user_id: string): Promise<void> {
	await bq().query({
		query: `UPDATE ${TABLE} SET last_login = CURRENT_TIMESTAMP() WHERE user_id = @user_id`,
		params: { user_id }
	});
}
