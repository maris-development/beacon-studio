/* eslint-disable @typescript-eslint/no-unused-vars */
import * as ApacheArrow from 'apache-arrow';
import { clsx, type ClassValue } from "clsx";
import pako from "pako";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from 'uuid';
import * as Navigation from "$app/navigation";


// import * as aq from 'arquero';
// Or in browser: aq.loadArrow(...)

 

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };


export class Utils {

    static setPageUrlParameter(pageIndex: number, parameterName: string = 'page') {
        const url = new URL(window.location.href);

        const currentValue = url.searchParams.get(parameterName);
        
        if (currentValue === String(pageIndex)) {
            return; // No change needed
        }

        url.searchParams.set(parameterName, String(pageIndex));

        Navigation.replaceState(url, {});
    }

    static uuidv4() {
        return uuidv4();
    }

    static copyToClipboard(text: string): boolean {
        try {
            // Use the modern clipboard API if available and we're in a secure context
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text);
                return true;
            }

            // Fallback: use a hidden textarea for older/insecure environments
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed'; // avoid scrolling to bottom
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';

            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            return successful;
        } catch (err) {
            console.error('Failed to copy text:', err);
            return false;
        }
    }

    static ucfirst(str: string): string {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    static objectToBase64(obj: unknown): string {
        return btoa(JSON.stringify(obj));
    }

    static base64ToObject<T>(base64: string): T {
        return JSON.parse(atob(base64)) as T;
    }

    static objectToGzipString<T>(obj: T): string {
        const json = JSON.stringify(obj);
        const encoder = new TextEncoder();
        const data = encoder.encode(json);
        const compressed = pako.gzip(data);
        return btoa(String.fromCharCode(...compressed));
    }

    static gzipStringToObject<T>(gzipString: string): T {
        const compressedData = Uint8Array.from(atob(gzipString), c => c.charCodeAt(0));
        const decompressed = pako.ungzip(compressedData, { to: 'string' });
        return JSON.parse(decompressed) as T;
    }
}

export class ApacheArrowUtils {

    /**
     * Calculates the bounding box for latitude and longitude values in an Apache Arrow table.
     *
     * @template T - The type map for the Apache Arrow table.
     * @param table - The Apache Arrow table containing geographic data, or `null` to return world bounds.
     * @param latitudeColumnName - The name of the latitude column (default: 'Latitude').
     * @param longitudeColumnName - The name of the longitude column (default: 'Longitude').
     * @returns A tuple containing the minimum and maximum longitude and latitude values:
     *          `[[minLongitude, minLatitude], [maxLongitude, maxLatitude]]`.
     *          If `table` is `null`, returns world bounds: `[[-180, -90], [180, 90]]`.
     * @throws If the table does not contain the specified latitude and longitude columns.
     */
    static getTableGeometryBounds<T extends ApacheArrow.TypeMap>(
		table: ApacheArrow.Table<T> | null,
        latitudeColumnName: string = 'Latitude',
        longitudeColumnName: string = 'Longitude'
	): [[number, number], [number, number]] {
        console.log('getTableGeometryBounds', table);


		if (!table) {
			//return world bounds:
			return [
				[-180, -90],
				[180, 90]
			];
		}

		const latCol = table.getChild(latitudeColumnName);
		const lonCol = table.getChild(longitudeColumnName);

		if (!latCol || !lonCol) {
			throw new Error('Table must contain Latitude and Longitude columns (case insensitive)');
		}

		let minLat = Infinity;
		let maxLat = -Infinity;
		let minLon = Infinity;
		let maxLon = -Infinity;
		
		for (let i = 0; i < table.numRows; i++) {
			const lat = latCol.get(i);
			const lon = lonCol.get(i);
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
		}

		return [
			[minLon, minLat],
			[maxLon, maxLat]
		];
	}

    /**
     * Converts a typed value to its string representation based on the provided Apache Arrow type.
     * 
     * @param value - The value to convert. Can be of any type.
     * @param type - The Apache Arrow type describing the value's type.
     * @returns The string representation of the value, or an empty string if the value is `null` or `undefined`.
     *
     * @remarks
     * - For `Utf8`, `Int`, and `Float` types, the value is converted to a string using `String(value)`.
     * - For `Bool` type, returns `'true'` or `'false'`.
     * - For `Timestamp` type, converts the value to an ISO string using `Date`.
     * - For unsupported types, logs a warning and returns the stringified value.
     * 
     */
    static typedValueToString(value: unknown, type: ApacheArrow.Type): string {
        if (value === null || value === undefined) {
            return '';
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        switch ((type as any).typeId) {
            case ApacheArrow.Type.Utf8:
                return String(value);
                
            case ApacheArrow.Type.Int:
            case ApacheArrow.Type.Float:
                return String(value);

            case ApacheArrow.Type.Bool:
                return value ? 'true' : 'false';

            case ApacheArrow.Type.Timestamp:
            // case ApacheArrow.Type.TimestampNanosecond:
                return new Date(value as number).toISOString();

            default:
                console.warn(`Unsupported type for toString: ${type}`, type);
                return String(value);
        }
    }

    /**
     * Calculates the minimum and maximum numeric values in a specified column of an Apache Arrow table.
     *
     * Supports columns of type Timestamp, Int, and Float. For unsupported types, returns `{min: NaN, max: NaN}`.
     * Skips null and undefined values during calculation.
     *
     * @deprecated use ArrowWorkerManager.getColumnMinMax instead
     * 
     * @template T - The Apache Arrow TypeMap for the table.
     * @param table - The Apache Arrow table containing the data.
     * @param column - The name of the column to compute min and max for.
     * @returns An object containing the minimum and maximum values found in the column.
     * @throws If the specified column is not found in the table schema.
     */
    static getColumnMinMax<T extends ApacheArrow.TypeMap>(
        table: ApacheArrow.Table<T>,
        column: string
    ): {min: number, max: number} 
    {
        const colIndex = table.schema.fields.map(field => field.name).indexOf(column);

        if (colIndex === -1) throw new Error(`Column "${column}" not found in table schema.`);

        const colVec: ApacheArrow.Vector = table.getChild(column);
        const colArray = colVec.toArray();


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        switch((colVec.type as any).typeId) {
            case ApacheArrow.Type.Timestamp:
            case ApacheArrow.Type.Int:
            case ApacheArrow.Type.Float:
                break;
            default:
                console.warn(`Unsupported column type for min/max calculation: ${colVec.type.typeId} (${column})`);
                return {min: NaN, max: NaN}; // Return NaN for unsupported
        }


        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        for (const value of colArray) {
            if (value === null || value === undefined) continue; // Skip null/undefined values
            if (value < min) min = value;
            if (value > max) max = value;
        }

        return {min, max};
    }


    /**
     * Sorts an Apache Arrow Table by a specified column and direction.
     *
     * @deprecated use ArrowWorkerManager.orderTableByColumn instead
     * @template T - The Apache Arrow TypeMap for the table.
     * @param table - The Apache Arrow Table to be sorted.
     * @param column - The name of the column to sort by.
     * @param direction - The sort direction, either 'asc' for ascending or 'desc' for descending.
     * @returns A new Apache Arrow Table sorted by the specified column and direction. If the column is not found or the type is unsupported, returns the original table.
     *
     * @remarks
     * - Supports sorting for columns of type Timestamp, Int, Float, Utf8 (string), and Bool.
     * - Null values are sorted to the end of the table.
     * - If the column does not exist or its type is unsupported, the original table is returned.
     * - The schema of the original table is preserved in the sorted table.
     *
     * @example
     * ```typescript
     * const sortedTable = orderTableByColumn(table, 'age', 'asc');
     * ```
     */
    static orderTableByColumn<T extends ApacheArrow.TypeMap>(
        table: ApacheArrow.Table<T>,
        column: string,
        direction: SortDirection
    ): ApacheArrow.Table<T> {
        const colIndex = table.schema.fields.map(field => field.name).indexOf(column);

        if (colIndex === -1) return table;

        const sortColumn: ApacheArrow.Vector = table.getChild(column);
        const sortedColumnArray = sortColumn.toArray();
        const indexedArray = [];

        for (let i = 0; i < sortedColumnArray.length; i++) {
            indexedArray.push({ index: i, value: sortedColumnArray[i] });
        }

        console.log('Sorting table', column, direction, table)

        let sortedIndices: number[];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        switch((sortColumn.type as any).typeId) {
            // case ApacheArrow.Type.Timestamp: 
            //     // Timestamp sorting
            //     sortedIndices = indexedArray.sort((a, b) => {
            //         const valA = a.value as number;
            //         const valB = b.value as number;
            //         if (valA === null && valB === null) return 0;
            //         if (valA === null) return 1;
            //         if (valB === null) return -1;
            //         return direction === 'asc' ? valA - valB : valB - valA;
            //     }).map(item => item.index);
            //     break;
            case ApacheArrow.Type.Timestamp: 
            case ApacheArrow.Type.Int: 
            case ApacheArrow.Type.Float:
                // Numeric sorting
                sortedIndices = indexedArray.sort((a, b) => {
                    const valA = a.value as number;
                    const valB = b.value as number;
                    if (valA === null && valB === null) return 0;
                    if (valA === null) return 1;
                    if (valB === null) return -1;
                    return direction === 'asc' ? valA - valB : valB - valA;
                }).map(item => item.index);
                break;

            case ApacheArrow.Type.Utf8:
                // String sorting
                sortedIndices = indexedArray.sort((a, b) => {
                    const valA = a.value as string;
                    const valB = b.value as string;
                    if (valA === null && valB === null) return 0;
                    if (valA === null) return 1;
                    if (valB === null) return -1;
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }).map(item => item.index);
                break;

            case ApacheArrow.Type.Bool:
                // Boolean sorting
                sortedIndices = indexedArray.sort((a, b) => {
                    const valA = a.value as boolean;
                    const valB = b.value as boolean;
                    if (valA === null && valB === null) return 0;
                    if (valA === null) return 1;
                    if (valB === null) return -1;
                    return direction === 'asc' ? (valA === valB ? 0 : valA ? 1 : -1) : (valA === valB ? 0 : valA ? -1 : 1);
                }).map(item => item.index);
                break;

            default:
                // console.warn(`Unsupported column type for sorting: ${sortColumn.type.typeId}`);
                return table; // Return original table if type is unsupported
        }

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const sortedColumns: Record<string, any> = {};


        for (const field of table.schema.fields) {
			const name = field.name;
			const col = table.getChild(name)!;
            const values = sortedIndices.map((idx) => col.get(idx));
            // For every row‐index in sortedIndices, pull out col.get(idx)
            sortedColumns[name] = ApacheArrow.vectorFromArray(values, field.type);
        }

        const sortedTable = ApacheArrow.tableFromArrays(sortedColumns);
            
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sortedTable as any).schema = table.schema;

		return sortedTable as unknown as ApacheArrow.Table<T>; //ignore ts errors

    }

    /**
     * Deduplicates rows in an Apache Arrow Table based on latitude and longitude columns.
     *
     * @deprecated use ArrowWorkerManager.deduplicate instead
     * 
     * This method scans the specified number of rows (or all rows if not specified) and removes duplicates
     * where the latitude and longitude values (rounded to two decimal places) are the same.
     * The resulting table preserves the original schema and contains only the first occurrence of each unique coordinate pair.
     *
     * @typeParam T - The Apache Arrow TypeMap for the table.
     * @param table - The Apache Arrow Table to deduplicate.
     * @param latitudeColumnName - The name of the latitude column. Defaults to 'Latitude'.
     * @param longitudeColumnName - The name of the longitude column. Defaults to 'Longitude'.
     * @param amountOfRows - The number of rows to consider for deduplication. If undefined, all rows are considered.
     * @returns A new Apache Arrow Table with duplicate rows (based on latitude and longitude) removed.
     */
    static deduplicateTable<T extends ApacheArrow.TypeMap>(
		table: ApacheArrow.Table<T>,
        latitudeColumnName: string = 'Latitude',
        longitudeColumnName: string = 'Longitude',
        amountOfRows: number = undefined,

	): ApacheArrow.Table<T> {

        if(!amountOfRows) {
            amountOfRows = table.numRows;
        }

		console.log(`Deduplicating ${amountOfRows} rows based on ${latitudeColumnName} and ${longitudeColumnName}`, table);

		const latCol = table.getChild(latitudeColumnName);
		const lonCol = table.getChild(longitudeColumnName);

		const seen = new Set<string>();
		const keepIndexes: number[] = [];

		// Efficiently iterate column-wise
		for (let i = 0; i < amountOfRows; i++) {
			const lat: number = latCol?.get(i);
			const lon: number = lonCol?.get(i);

			// Optional: round coordinates to avoid floating-point noise
			const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

			if (!seen.has(key)) {
				seen.add(key);
				keepIndexes.push(i);
			}
		}

		console.log(`Deduplicated from ${amountOfRows} to ${keepIndexes.length} rows`, );

		// 3. Rebuild each column as a JS array of the kept values
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const dedupColumns: Record<string, any> = {};

		for (const field of table.schema.fields) {
			const name = field.name;
			const col = table.getChild(name)!;
			const values = keepIndexes.map((idx) => col.get(idx));
			// For every row‐index in keepIdx, pull out col.get(idx)
			dedupColumns[name] = ApacheArrow.vectorFromArray(values, field.type);
		}

		const deduped = ApacheArrow.tableFromArrays(dedupColumns);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(deduped as any).schema = table.schema; // Preserve original schema


		return deduped as unknown as ApacheArrow.Table<T>; //ignore ts errors
	}

}


export type SortDirection = 'asc' | 'desc';
export type Column = { key: string; header: string; sortable: boolean, rawHtml?: boolean, ref?: HTMLElement, isSorted?: boolean, sortDirection?: SortDirection };
export class AffixString {
    prefix: string;
    main: string | null;
    suffix: string;

    constructor(main: string | null, prefix: string = '', suffix: string = '') {
        this.prefix = prefix;
        this.main = main;
        this.suffix = suffix;
    }

    toString(): string {
        return `${this.prefix}${this.main ?? ''}${this.suffix}`;
    }
};
export class VirtualPaginationData<Row> {

    originalData: Row[];
    data: Row[];
    length: number;

    constructor(data: Row[]) {
        this.originalData = data;
        this.data = data;
        this.length = data.length;
    }

    getPageData(offset: number, limit: number): Row[] {
        return this.data.slice(offset, offset + limit);
    }

    setData(data: Row[]) {
        this.originalData = data;
        this.data = data;
        this.length = data.length;
    }

    filter(predicate: (item: Row) => boolean): number {
        this.data = this.originalData.filter(predicate);
        this.length = this.data.length;
        return this.length;
    }

    resetFilter(): number {
        this.data = this.originalData;
        this.length = this.data.length;
        return this.length;
    }
}

export class VirtualPaginationArrowTableData {
    data: ApacheArrow.Table = new ApacheArrow.Table();
    length: number = 0;
    schema: ApacheArrow.Schema = new ApacheArrow.Schema([]);

    sortColumn: string | null = null;
    sortDirection: SortDirection | null = null;

    constructor(data: ApacheArrow.Table | undefined = undefined) {
        this.setData(data);
    }

    getPageData(offset: number, limit: number): Record<string, string>[] {
        const pageData: Record<string, string>[] = [];

        for (let i = offset; i < offset + limit && i < this.length; i++) {
            const row: ApacheArrow.StructRowProxy = this.data.get(i);
            const data = row.toArray();

            pageData.push(
                Object.fromEntries(
                    this.data.schema.fields.map((field: ApacheArrow.Field, idx: number) => {
                        return [field.name, ApacheArrowUtils.typedValueToString(data[idx], field.type)];
                    })
                )
            );
        }

        return pageData;
    }

    setData(data: ApacheArrow.Table | undefined) {
        if (!data) {
            data = new ApacheArrow.Table();
        }

        this.data = data;
        this.length = data.numRows;
        this.schema = data.schema;
    }

    filter(predicate: (item: unknown) => boolean): number {
        throw new Error('Filtering not implemented for Apache Arrow Table');
    }

    resetFilter(): number {
        throw new Error('Filtering not implemented for Apache Arrow Table');
    }

    getFieldNames(): string[] {
        return this.schema.fields.map(field => field.name);
    }


    orderBy(column: string, direction: SortDirection) {

        this.sortColumn = column;
        this.sortDirection = direction;

        this.data = ApacheArrowUtils.orderTableByColumn(
            this.data,
            column,
            direction
        );

        
    }
}