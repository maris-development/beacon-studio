/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ApacheArrow from 'apache-arrow';
import ArrowProcessingWorker from '$lib/workers/ArrowProcessingWorker?worker';
import type { WorkerRequest, WorkerResponse } from './ArrowProcessingWorker';
import type { SortDirection } from '@/util-types';
import { addToast } from '@/stores/toasts';

interface PendingTask {
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
}

/** How many tables the worker keeps loaded at once (main thread mirrors this). */
const MAX_LOADED_TABLES = 2;

/**
 * Main-thread handle to the shared Arrow processing worker.
 *
 * Tables are transferred to the worker once per `key` (load-once) and referenced
 * by key on subsequent operations, rather than re-serialized on every call. Use
 * the shared instance via {@link getArrowWorker} rather than constructing your own
 * — a single long-lived worker keeps its loaded tables warm across navigations.
 */
export class ArrowProcessingWorkerManager {
	private worker: Worker;
	private messageId: number = 0;
	private pendingTasks: Map<number, PendingTask> = new Map();

	/** Keys currently loaded in the worker, in LRU order (oldest first). */
	private loadedOrder: string[] = [];
	/** In-flight `loadTable` promises, so concurrent loads of a key share one request. */
	private loading: Map<string, Promise<void>> = new Map();

	constructor() {
		this.worker = new ArrowProcessingWorker({ name: 'ArrowProcessingWorker' });
		this.setupWorkerListeners();
	}

	private setupWorkerListeners(): void {
		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const { id } = event.data;
			const task = this.pendingTasks.get(id);

			if (!task) {
				console.warn(`No pending task found for message ID ${id}`);
				return;
			}

			this.pendingTasks.delete(id);

			if ('error' in event.data) {
				const { action, error } = event.data;
				console.error(`Worker error for message ID ${id} (${action}):`, error);
				task.reject(new Error(error));
				return;
			}

			switch (event.data.action) {
				case 'loadTable':
				case 'unloadTable':
				case 'getColumnMinMax':
				case 'findSimilarRowsByLatLon':
					task.resolve(event.data.result);
					break;
				case 'orderTableByColumn':
				case 'deduplicateTable':
				case 'buildMapPointTable':
					task.resolve(ApacheArrow.tableFromIPC(event.data.result));
					break;
			}
		};

		this.worker.onerror = (error: ErrorEvent) => {
			console.error('Worker error:', error);
			if (error.message) {
				addToast({ message: `${error.message}`, type: 'error' });
			}
		};
	}

	private sendTask(request: Omit<WorkerRequest, 'id'>): Promise<any> {
		const id = this.messageId++;
		return new Promise((resolve, reject) => {
			this.pendingTasks.set(id, { resolve, reject });
			this.worker.postMessage({ ...request, id });
		});
	}

	/**
	 * Ensures `table` is loaded in the worker under `key`, transferring it at most
	 * once. Bumps the key to most-recently-used and evicts the oldest table(s) when
	 * over {@link MAX_LOADED_TABLES}.
	 */
	private async ensureLoaded(key: string, table: ApacheArrow.Table): Promise<void> {
		if (this.loadedOrder.includes(key)) {
			this.bump(key);
			return;
		}

		const inFlight = this.loading.get(key);
		if (inFlight) return inFlight;

		const promise = this.sendTask({
			action: 'loadTable',
			payload: { key, table: ApacheArrow.tableToIPC(table) }
		})
			.then(() => {
				this.loadedOrder.push(key);
				this.evictLoaded(key);
			})
			.finally(() => {
				this.loading.delete(key);
			});

		this.loading.set(key, promise);
		return promise;
	}

	private bump(key: string): void {
		const index = this.loadedOrder.indexOf(key);
		if (index >= 0) {
			this.loadedOrder.splice(index, 1);
			this.loadedOrder.push(key);
		}
	}

	/** Evicts least-recently-used tables from the worker, never the one just used. */
	private evictLoaded(keep: string): void {
		while (this.loadedOrder.length > MAX_LOADED_TABLES) {
			const oldest = this.loadedOrder[0];
			if (oldest === keep) break;
			this.loadedOrder.shift();
			// Fire-and-forget; a stale table in the worker is only wasted memory.
			this.sendTask({ action: 'unloadTable', payload: { key: oldest } }).catch(() => {});
		}
	}

	// -- public API -------------------------------------------------------------

	async getColumnMinMax(
		key: string,
		table: ApacheArrow.Table,
		column: string
	): Promise<{ min: number; max: number }> {
		await this.ensureLoaded(key, table);
		return this.sendTask({ action: 'getColumnMinMax', payload: { key, columnName: column } });
	}

	async orderTableByColumn(
		key: string,
		table: ApacheArrow.Table,
		column: string,
		direction: SortDirection
	): Promise<ApacheArrow.Table> {
		await this.ensureLoaded(key, table);
		return this.sendTask({
			action: 'orderTableByColumn',
			payload: { key, columnName: column, direction }
		});
	}

	async deduplicateTable(
		key: string,
		table: ApacheArrow.Table,
		latitudeColumnName = 'Latitude',
		longitudeColumnName = 'Longitude',
		amountOfRows: number = undefined,
		decimals: number = 3
	): Promise<ApacheArrow.Table> {
		await this.ensureLoaded(key, table);
		return this.sendTask({
			action: 'deduplicateTable',
			payload: { key, latitudeColumnName, longitudeColumnName, amountOfRows, decimals }
		});
	}

	async findSimilarRowsByLatLon(
		key: string,
		table: ApacheArrow.Table,
		latLon: [number, number],
		groupByDecimals: number = 3,
		latitudeColumnName: string = 'Latitude',
		longitudeColumnName: string = 'Longitude',
		maxRows: number = 100
	): Promise<unknown[]> {
		await this.ensureLoaded(key, table);
		return this.sendTask({
			action: 'findSimilarRowsByLatLon',
			payload: { key, latLon, groupByDecimals, latitudeColumnName, longitudeColumnName, maxRows }
		});
	}

	/**
	 * Deduplicates by lat/lon and appends a GeoArrow point geometry column, ready
	 * for `@geoarrow/deck.gl-layers`. One round-trip against the loaded table.
	 */
	async buildMapPointTable(
		key: string,
		table: ApacheArrow.Table,
		latitudeColumnName: string,
		longitudeColumnName: string,
		groupByDecimals: number = 3,
		geometryColumnName: string = 'geometry'
	): Promise<ApacheArrow.Table> {
		await this.ensureLoaded(key, table);
		return this.sendTask({
			action: 'buildMapPointTable',
			payload: { key, latitudeColumnName, longitudeColumnName, groupByDecimals, geometryColumnName }
		});
	}

	terminate(): void {
		this.worker.terminate();
		this.pendingTasks.clear();
		this.loadedOrder = [];
		this.loading.clear();
	}
}

let sharedWorker: ArrowProcessingWorkerManager | null = null;

/**
 * Returns the app-wide shared {@link ArrowProcessingWorkerManager}, creating it on
 * first use (browser only). Prefer this over `new ArrowProcessingWorkerManager()`
 * so tables stay loaded across page navigations. Do not `terminate()` the shared
 * instance from a page.
 */
export function getArrowWorker(): ArrowProcessingWorkerManager {
	if (!sharedWorker) {
		sharedWorker = new ArrowProcessingWorkerManager();
	}
	return sharedWorker;
}
