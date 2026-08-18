/**
 * Composes the default warehouse client from env + the ID-token source. Both the
 * page `load` (SSR detail) and the remote functions go through this, so there's one
 * place that wires baseUrl + auth.
 */
import { env } from '$env/dynamic/private';
import { createWarehouseClient, type WarehouseClient } from './client';
import { getWarehouseIdToken } from './token';

export function warehouseClient(): WarehouseClient {
	const baseUrl = env.WAREHOUSE_API_URL;
	if (!baseUrl) throw new Error('WAREHOUSE_API_URL is not set — cannot reach the warehouse.');
	return createWarehouseClient({ baseUrl, getIdToken: getWarehouseIdToken });
}

export { GameNotFoundError, WarehouseError } from './types';
export type { GameDocument, GameFeatures, NewGameRow } from './types';
