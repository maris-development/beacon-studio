/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ApacheArrow from 'apache-arrow';
import ArrowProcessingWorker from '$lib/workers/ArrowProcessingWorker?worker';
import type { WorkerRequest, WorkerResponse } from './ArrowProcessingWorker';

interface PendingTask {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  request: WorkerRequest;
}

export class ArrowProcessingWorkerManagager {
  private worker: Worker;
  private messageId: number = 0;
  private pendingTasks: Map<number, PendingTask> = new Map();

  constructor() {
    this.worker = new ArrowProcessingWorker({
      name: 'ArrowProcessingWorker'
    });
    this.setupWorkerListeners();
  }

  private setupWorkerListeners(): void {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      console.log('Worker message received:', event);

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

      const { action } = event.data;


      switch (action) {
        case 'orderTableByColumn': {
          const { result } = event.data;
          task.resolve(ApacheArrow.tableFromIPC(result));
          break;
        }
        case 'deduplicateTable': {
          const { result } = event.data;
          task.resolve(ApacheArrow.tableFromIPC(result));
          break;
        }
        case 'getColumnMinMax': {
          const { result } = event.data;
          task.resolve(result);
          break;
        }
        case 'findSimilarRowsByLatLon': {
          const { result } = event.data;
          task.resolve(result);
          break;
        }
      }


    }

    this.worker.onerror = (error: ErrorEvent) => {
      console.error('Worker error:', error);
    };
  }



  private sendTask(request: Partial<WorkerRequest>): Promise<any> {
    request.id = this.messageId++;
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(request.id, { resolve, reject, request: (request as WorkerRequest) });
      this.worker.postMessage(request);
    });
  }

  // Public methods
  getColumnMinMax(table: ApacheArrow.Table, column: string): Promise<{ min: number; max: number }> {
    const request: Partial<WorkerRequest> = {
      action: 'getColumnMinMax',
      payload: {
        table: ApacheArrow.tableToIPC(table),
        columnName: column
      }
    };
    return this.sendTask(request);
  }

  orderTableByColumn(table: ApacheArrow.Table, column: string, direction: 'asc' | 'desc'): Promise<any> {
    const request: Partial<WorkerRequest> = {
      action: 'orderTableByColumn',
      payload: {
        table: ApacheArrow.tableToIPC(table),
        columnName: column,
        direction
      }
    };
    return this.sendTask(request);
  }

  deduplicateTable(
    table: ApacheArrow.Table,
    latitudeColumnName = 'Latitude',
    longitudeColumnName = 'Longitude',
    amountOfRows: number = undefined,
    decimals: number = 3
  ): Promise<any> {
    const request: Partial<WorkerRequest> = {
      action: 'deduplicateTable',
      payload: {
        table: ApacheArrow.tableToIPC(table),
        latitudeColumnName,
        longitudeColumnName,
        amountOfRows,
        decimals
      }
    };
    return this.sendTask(request);
  }

  findSimilarRowsByLatLon(
    table: ApacheArrow.Table,
    latLon: [number, number],
    groupByDecimals: number = 3,
    latitudeColumnName: string = 'Latitude',
    longitudeColumnName: string = 'Longitude',
    maxRows: number = 100
  ): Promise<any> {
    const request: Partial<WorkerRequest> = {
      action: 'findSimilarRowsByLatLon',
      payload: {
        table: ApacheArrow.tableToIPC(table),
        latLon,
        groupByDecimals,
        latitudeColumnName,
        longitudeColumnName,
        maxRows
      }
    };
    return this.sendTask(request);
  }

  terminate(): void {
    this.worker.terminate();
    this.pendingTasks.clear();
  }
}
