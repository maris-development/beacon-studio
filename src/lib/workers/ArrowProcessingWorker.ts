import { ApacheArrowUtils } from '@/arrow-utils';
import type { SortDirection } from '@/util-types';
import * as ApacheArrow from 'apache-arrow';

//find similar rows by latitude and longitude
type FindSimilarRowByLatLonRequestPayload = {
    table: Uint8Array;
    latLon: [number, number];
    groupByDecimals?: number;
    latitudeColumnName?: string;
    longitudeColumnName?: string;
    maxRows?: number;
}
type FindSimilarRowByLatLonRequest = {
    id: number;
    action: 'findSimilarRowsByLatLon';
    payload: FindSimilarRowByLatLonRequestPayload;
}
type FindSimilarRowByLatLonResponse = {
    id: number;
    action: 'findSimilarRowsByLatLon';
    result: unknown[];
}

//order table by column
type OrderTableByColumnRequestPayload = {
    table: Uint8Array;
    columnName: string;
    direction: SortDirection;
}
type OrderTableByColumnRequest = {
    id: number;
    action: 'orderTableByColumn';
    payload: OrderTableByColumnRequestPayload;
}
type OrderTableByColumnResponse = {
    id: number;
    action: 'orderTableByColumn';
    result: Uint8Array; // IPC format of the ordered table
}

// deduplicate table
type DeduplicateTableRequestPayload = {
    table: Uint8Array;
    latitudeColumnName?: string;
    longitudeColumnName?: string;
    amountOfRows?: number;
    decimals?: number;
}
type DeduplicateTableRequest = {
    id: number;
    action: 'deduplicateTable';
    payload: DeduplicateTableRequestPayload;
}
type DeduplicateTableResponse = {
    id: number;
    action: 'deduplicateTable';
    result: Uint8Array; // IPC format of the deduplicated table
}

// get column min and max
type GetColumnMinMaxRequestPayload = {
    table: Uint8Array;
    columnName: string;
}
type GetColumnMinMaxRequest = {
    id: number;
    action: 'getColumnMinMax';
    payload: GetColumnMinMaxRequestPayload;
}
type GetColumnMinMaxResponse = {
    id: number;
    action: 'getColumnMinMax';
    result: { min: number; max: number };
}

//errorresponse
type ErrorResponse = {
    id: number;
    action: string;
    error: string;
}

export type WorkerRequestPayload = FindSimilarRowByLatLonRequestPayload | OrderTableByColumnRequestPayload | GetColumnMinMaxRequestPayload | DeduplicateTableRequestPayload;
export type WorkerRequest = FindSimilarRowByLatLonRequest | OrderTableByColumnRequest | GetColumnMinMaxRequest | DeduplicateTableRequest;
export type WorkerResponse = FindSimilarRowByLatLonResponse | OrderTableByColumnResponse | GetColumnMinMaxResponse | DeduplicateTableResponse | ErrorResponse;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, action, payload } = event.data;

    console.log("ArrowProcessingWorkerEvent.ts", { id, action, payload });

    switch (action) {
        case 'orderTableByColumn': {
            const result = ApacheArrowUtils.orderTableByColumn(
                ApacheArrow.tableFromIPC(payload.table),
                payload.columnName,
                payload.direction
            );
            const response: OrderTableByColumnResponse = {
                id,
                action,
                result: ApacheArrow.tableToIPC(result)
            };
            self.postMessage(response);
            break;
        }

        case 'deduplicateTable': {
            const result = ApacheArrowUtils.deduplicateTable(
                ApacheArrow.tableFromIPC(payload.table),
                payload.latitudeColumnName,
                payload.longitudeColumnName,
                payload.amountOfRows,
                payload.decimals
            );
            const response: DeduplicateTableResponse = {
                id,
                action,
                result: ApacheArrow.tableToIPC(result)
            };
            self.postMessage(response);
            break;
        }



        case 'getColumnMinMax': {
            const response: GetColumnMinMaxResponse = {
                id,
                action,
                result: ApacheArrowUtils.getColumnMinMax(
                    ApacheArrow.tableFromIPC(payload.table),
                    payload.columnName
                )
            };
            self.postMessage(response);
            break;
        }



        case 'findSimilarRowsByLatLon': {
            const response: FindSimilarRowByLatLonResponse = {
                id,
                action: action,
                result: ApacheArrowUtils.findSimilarRowsByLatLon(
                    ApacheArrow.tableFromIPC(payload.table),
                    payload.latLon,
                    payload.groupByDecimals,
                    payload.latitudeColumnName,
                    payload.longitudeColumnName,
                    payload.maxRows
                )
            };

            self.postMessage(response);
            break;
        }



        default:
            self.postMessage({
                id,
                action,
                error: `Unknown action: ${action}`
            });
            break;
    }

}

