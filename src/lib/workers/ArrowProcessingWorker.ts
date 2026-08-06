import { ApacheArrowUtils } from '@/arrow-utils';
import type { SortDirection } from '@/util-types';
import * as ApacheArrow from 'apache-arrow';

/**
 * Off-main-thread Arrow processing worker.
 *
 * Tables are loaded once by key via the `loadTable` action and cached in-worker,
 * so subsequent operations (sort, dedup, min/max, ...) reference the table by
 * `key` instead of re-transferring the whole IPC payload on every call. The main
 * thread ({@link ArrowProcessingWorkerManager}) owns the load/unload lifecycle.
 */
const tables = new Map<string, ApacheArrow.Table>();

// -- load / unload ----------------------------------------------------------

type LoadTableRequestPayload = {
	key: string;
	table: Uint8Array; // IPC stream of the table to cache
};
type LoadTableRequest = {
	id: number;
	action: 'loadTable';
	payload: LoadTableRequestPayload;
};
type LoadTableResponse = {
	id: number;
	action: 'loadTable';
	result: true;
};

type UnloadTableRequestPayload = {
	key: string;
};
type UnloadTableRequest = {
	id: number;
	action: 'unloadTable';
	payload: UnloadTableRequestPayload;
};
type UnloadTableResponse = {
	id: number;
	action: 'unloadTable';
	result: true;
};

// -- find similar rows by latitude and longitude ----------------------------
type FindSimilarRowByLatLonRequestPayload = {
	key: string;
	latLon: [number, number];
	groupByDecimals?: number;
	latitudeColumnName?: string;
	longitudeColumnName?: string;
	maxRows?: number;
};
type FindSimilarRowByLatLonRequest = {
	id: number;
	action: 'findSimilarRowsByLatLon';
	payload: FindSimilarRowByLatLonRequestPayload;
};
type FindSimilarRowByLatLonResponse = {
	id: number;
	action: 'findSimilarRowsByLatLon';
	result: unknown[];
};

// -- order table by column --------------------------------------------------
type OrderTableByColumnRequestPayload = {
	key: string;
	columnName: string;
	direction: SortDirection;
};
type OrderTableByColumnRequest = {
	id: number;
	action: 'orderTableByColumn';
	payload: OrderTableByColumnRequestPayload;
};
type OrderTableByColumnResponse = {
	id: number;
	action: 'orderTableByColumn';
	result: Uint8Array; // IPC format of the ordered table
};

// -- deduplicate table ------------------------------------------------------
type DeduplicateTableRequestPayload = {
	key: string;
	latitudeColumnName?: string;
	longitudeColumnName?: string;
	amountOfRows?: number;
	decimals?: number;
};
type DeduplicateTableRequest = {
	id: number;
	action: 'deduplicateTable';
	payload: DeduplicateTableRequestPayload;
};
type DeduplicateTableResponse = {
	id: number;
	action: 'deduplicateTable';
	result: Uint8Array; // IPC format of the deduplicated table
};

// -- build map point table (dedup by lat/lon, then add geoarrow point geometry) --
type BuildMapPointTableRequestPayload = {
	key: string;
	latitudeColumnName: string;
	longitudeColumnName: string;
	groupByDecimals?: number;
	geometryColumnName?: string;
};
type BuildMapPointTableRequest = {
	id: number;
	action: 'buildMapPointTable';
	payload: BuildMapPointTableRequestPayload;
};
type BuildMapPointTableResponse = {
	id: number;
	action: 'buildMapPointTable';
	result: Uint8Array; // IPC format of the deduplicated table with a geometry column
};

// -- count points inside a drawn ring ---------------------------------------
type CountPointsInRingRequestPayload = {
	key: string;
	/** A closed ring of [longitude, latitude] pairs. */
	ring: [number, number][];
	latitudeColumnName: string;
	longitudeColumnName: string;
};
type CountPointsInRingRequest = {
	id: number;
	action: 'countPointsInRing';
	payload: CountPointsInRingRequestPayload;
};
type CountPointsInRingResponse = {
	id: number;
	action: 'countPointsInRing';
	result: number;
};

// -- get column min and max -------------------------------------------------
type GetColumnMinMaxRequestPayload = {
	key: string;
	columnName: string;
};
type GetColumnMinMaxRequest = {
	id: number;
	action: 'getColumnMinMax';
	payload: GetColumnMinMaxRequestPayload;
};
type GetColumnMinMaxResponse = {
	id: number;
	action: 'getColumnMinMax';
	result: { min: number; max: number };
};

// -- error ------------------------------------------------------------------
type ErrorResponse = {
	id: number;
	action: string;
	error: string;
};

export type WorkerRequest =
	| LoadTableRequest
	| UnloadTableRequest
	| FindSimilarRowByLatLonRequest
	| OrderTableByColumnRequest
	| GetColumnMinMaxRequest
	| DeduplicateTableRequest
	| BuildMapPointTableRequest
	| CountPointsInRingRequest;

export type WorkerResponse =
	| LoadTableResponse
	| UnloadTableResponse
	| FindSimilarRowByLatLonResponse
	| OrderTableByColumnResponse
	| GetColumnMinMaxResponse
	| DeduplicateTableResponse
	| BuildMapPointTableResponse
	| CountPointsInRingResponse
	| ErrorResponse;

/** Looks up a loaded table, throwing a descriptive error when it isn't cached. */
function getTable(key: string): ApacheArrow.Table {
	const table = tables.get(key);
	if (!table) {
		throw new Error(`Table "${key}" is not loaded in the worker.`);
	}
	return table;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const { id, action, payload } = event.data;

	try {
		switch (action) {
			case 'loadTable': {
				tables.set(payload.key, ApacheArrow.tableFromIPC(payload.table));
				self.postMessage({ id, action, result: true } satisfies LoadTableResponse);
				break;
			}

			case 'unloadTable': {
				tables.delete(payload.key);
				self.postMessage({ id, action, result: true } satisfies UnloadTableResponse);
				break;
			}

			case 'orderTableByColumn': {
				const result = ApacheArrowUtils.orderTableByColumn(
					getTable(payload.key),
					payload.columnName,
					payload.direction
				);
				self.postMessage({
					id,
					action,
					result: ApacheArrow.tableToIPC(result)
				} satisfies OrderTableByColumnResponse);
				break;
			}

			case 'deduplicateTable': {
				const result = ApacheArrowUtils.deduplicateTable(
					getTable(payload.key),
					payload.latitudeColumnName,
					payload.longitudeColumnName,
					payload.amountOfRows,
					payload.decimals
				);
				self.postMessage({
					id,
					action,
					result: ApacheArrow.tableToIPC(result)
				} satisfies DeduplicateTableResponse);
				break;
			}

			case 'getColumnMinMax': {
				self.postMessage({
					id,
					action,
					result: ApacheArrowUtils.getColumnMinMax(getTable(payload.key), payload.columnName)
				} satisfies GetColumnMinMaxResponse);
				break;
			}

			case 'buildMapPointTable': {
				const deduped = ApacheArrowUtils.deduplicateTable(
					getTable(payload.key),
					payload.latitudeColumnName,
					payload.longitudeColumnName,
					undefined,
					payload.groupByDecimals
				);
				const withGeometry = ApacheArrowUtils.addPointGeometryColumn(
					deduped,
					payload.latitudeColumnName,
					payload.longitudeColumnName,
					payload.geometryColumnName
				);
				self.postMessage({
					id,
					action,
					result: ApacheArrow.tableToIPC(withGeometry)
				} satisfies BuildMapPointTableResponse);
				break;
			}

			case 'countPointsInRing': {
				self.postMessage({
					id,
					action,
					result: ApacheArrowUtils.countPointsInRing(
						getTable(payload.key),
						payload.ring,
						payload.latitudeColumnName,
						payload.longitudeColumnName
					)
				} satisfies CountPointsInRingResponse);
				break;
			}

			case 'findSimilarRowsByLatLon': {
				self.postMessage({
					id,
					action,
					result: ApacheArrowUtils.findSimilarRowsByLatLon(
						getTable(payload.key),
						payload.latLon,
						payload.groupByDecimals,
						payload.latitudeColumnName,
						payload.longitudeColumnName,
						payload.maxRows
					)
				} satisfies FindSimilarRowByLatLonResponse);
				break;
			}

			default: {
				self.postMessage({
					id,
					action,
					error: `Unknown action: ${action}`
				} satisfies ErrorResponse);
				break;
			}
		}
	} catch (error) {
		self.postMessage({
			id,
			action,
			error: error instanceof Error ? error.message : String(error)
		} satisfies ErrorResponse);
	}
};
