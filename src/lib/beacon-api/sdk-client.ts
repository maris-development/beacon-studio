/**
 * Factory for the `@beacon/client` SDK — the isomorphic TypeScript client the app
 * is migrating to (see AGENTS.md "API Client Strategy"). Prefer this over the
 * legacy `beacon-api/client.ts` for new code.
 *
 * The SDK talks to Beacon's native, zstd-compressed Arrow IPC endpoint and decodes
 * it directly to an Apache Arrow `Table` (no Parquet round-trip). Use
 * `client.queryArrow(query)` to get a `Table`, or `client.query(query)` for
 * `{ rows, queryId, table }`.
 */

import { BeaconClient as BeaconSdkClient } from '@beacon/client';
import type { BeaconInstance } from '@/stores/config';

export { BeaconSdkClient };

/**
 * Builds a `@beacon/client` client for the given Beacon instance.
 *
 * - A bearer token (if configured on the instance) is sent via the `Authorization`
 *   header on every request. The SDK's own `username`/`password` option is for
 *   HTTP Basic super-user auth and is intentionally not used here.
 * - `timeoutMs: 0` disables the SDK's default 60s per-request timeout so large
 *   query results aren't cut off mid-download — matching the legacy client, which
 *   sets no timeout.
 *
 * @throws if no instance (or no URL) is provided.
 */
export function makeBeaconClient(instance: BeaconInstance | null): BeaconSdkClient {
	if (!instance?.url) {
		throw new Error('No Beacon instance selected');
	}

	return new BeaconSdkClient({
		url: instance.url,
		headers: instance.token ? { Authorization: `Bearer ${instance.token}` } : undefined,
		timeoutMs: 0
	});
}
