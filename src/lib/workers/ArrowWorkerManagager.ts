/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ApacheArrow from 'apache-arrow';

type WorkerAction = 'orderTableByColumn' | 'deduplicateTable' | 'getColumnMinMax';

interface WorkerRequest {
  id: number;
  action: WorkerAction;
  payload: any;
}

interface WorkerResponse {
  id: number;
  result?: any;
  error?: string;
}

interface PendingTask {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  message: WorkerRequest;
}

export class ArrowWorkerManager {
  private worker: Worker;
  private messageId: number = 0;
  private pendingTasks: Map<number, PendingTask> = new Map();

  constructor(workerScript: string = '/arrow-worker.js') {
    this.worker = new Worker(workerScript);
    this.setupWorkerListeners();
  }

  private setupWorkerListeners(): void {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      console.log('Worker message received:', event);

      const { id, result, error } = event.data;

      if (error) {
        console.error("Worker error!", error);
        return;
      }

      const task = this.pendingTasks.get(id);

      if (!task) {
        console.warn(`No pending task found for message ID ${id}`);
        return;
      }

      this.pendingTasks.delete(id);

      if (error) {
        task.reject(new Error(error));

      } else {

        switch (task.message.action) {
          case 'orderTableByColumn':
          case 'deduplicateTable':
            task.resolve(ApacheArrow.tableFromIPC(result));
            break;
        }

        task.resolve(result);
      }
    };

    this.worker.onerror = (error: ErrorEvent) => {
      console.error('Worker error:', error);
    };
  }

  private sendTask(action: WorkerAction, payload: Record<string, any>): Promise<any> {
    const id = this.messageId++;
    const message: WorkerRequest = { id, action, payload };

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(id, { resolve, reject, message });
      this.worker.postMessage(message);
    });
  }

  // Public methods
  getColumnMinMax(table: ApacheArrow.Table, column: string): Promise<{ min: number; max: number }> {
    return this.sendTask('getColumnMinMax', { table: ApacheArrow.tableToIPC(table), column });
  }

  orderTableByColumn(table: ApacheArrow.Table, column: string, direction: 'asc' | 'desc'): Promise<any> {
    return this.sendTask('orderTableByColumn', {
      table: ApacheArrow.tableToIPC(table),
      column,
      direction
    });
  }

  deduplicateTable(
    table: ApacheArrow.Table,
    latitudeColumnName = 'Latitude',
    longitudeColumnName = 'Longitude',
    amountOfRows?: number
  ): Promise<any> {
    return this.sendTask('deduplicateTable', {
      table: ApacheArrow.tableToIPC(table),
      latitudeColumnName,
      longitudeColumnName,
      amountOfRows,
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pendingTasks.clear();
  }
}
