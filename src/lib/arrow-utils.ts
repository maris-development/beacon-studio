import * as ApacheArrow from 'apache-arrow';
import type { SortDirection } from './util-types';


export class ApacheArrowUtils {
    /**
     * Finds and returns rows from an Apache Arrow table whose latitude and longitude values
     * match the provided coordinates, rounded to a specified number of decimal places.
     *
     * @template T - The Apache Arrow TypeMap for the table.
     * @param table - The Apache Arrow table to search.
     * @param latLon - A tuple containing the latitude and longitude to match.
     * @param groupByDecimals - The number of decimal places to use when comparing coordinates (default: 3).
     * @param latitudeColumnName - The name of the latitude column in the table (default: 'Latitude').
     * @param longitudeColumnName - The name of the longitude column in the table (default: 'Longitude').
     * @param maxRows - The maximum number of matching rows to return (default: 100).
     * @returns An array of records representing the rows that match the specified coordinates.
     * @throws If the table does not contain the specified latitude or longitude columns.
     */
    static findSimilarRowsByLatLon<T extends ApacheArrow.TypeMap>(
        table: ApacheArrow.Table<T>,
        latLon: [number, number],
        groupByDecimals: number = 3,
        latitudeColumnName: string = 'Latitude',
        longitudeColumnName: string = 'Longitude',
        maxRows: number = 100
    ): unknown[] {

        const toKey = (lat: number, lon: number): string => {
            return `${lat.toFixed(groupByDecimals)},${lon.toFixed(groupByDecimals)}`;
        };

        const latCol = table.getChild(latitudeColumnName);
        const lonCol = table.getChild(longitudeColumnName);
        const rows = table.numRows;

        // const amountOfFields = table.schema.fields.length;
        

        if (!latCol || !lonCol) {
            throw new Error('Table must contain Latitude and Longitude columns (case insensitive)');
        }

        const results: unknown[] = [];
        const searchKey = toKey(latLon[0], latLon[1]);

        for (let i = 0; i < rows; i++) {
            const rowLat = latCol.get(i);
            const rowLon = lonCol.get(i);
            const rowKey = toKey(rowLat, rowLon);

            if (rowKey === searchKey) {

                const rowData = table.get(i).toArray().copyWithin(5, 0);
                results.push(rowData);

                if(results.length >= maxRows) {
                    break;
                }
            }
        }

        return results;
    }

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

    static arrayToRecord(array: unknown[], schema: ApacheArrow.Schema): Record<string, unknown> {
        const record: Record<string, unknown> = {};

        schema.fields.forEach((field, index) => {
            if (field.name === 'geometry') return; // Skip geometry field
            record[field.name] = ApacheArrowUtils.typedValueToString(array[index], field.type);
        });

        return record;
    }

    /**
     * Calculates the minimum and maximum numeric values in a specified column of an Apache Arrow table.
     *
     * Supports columns of type Timestamp, Int, and Float. For unsupported types, returns `{min: NaN, max: NaN}`.
     * Skips null and undefined values during calculation.
     *
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
    ): { min: number, max: number } {
        const colIndex = table.schema.fields.map(field => field.name).indexOf(column);

        if (colIndex === -1) throw new Error(`Column "${column}" not found in table schema.`);

        const colVec: ApacheArrow.Vector = table.getChild(column);
        const colArray = colVec.toArray();


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        switch ((colVec.type as any).typeId) {
            case ApacheArrow.Type.Timestamp:
            case ApacheArrow.Type.Int:
            case ApacheArrow.Type.Float:
                break;
            default:
                console.warn(`Unsupported column type for min/max calculation: ${colVec.type.typeId} (${column})`);
                return { min: NaN, max: NaN }; // Return NaN for unsupported
        }


        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        for (const value of colArray) {
            if (value === null || value === undefined) continue; // Skip null/undefined values
            if (value < min) min = value;
            if (value > max) max = value;
        }

        return { min, max };
    }


    /**
     * Sorts an Apache Arrow Table by a specified column and direction.
     *
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
        switch ((sortColumn.type as any).typeId) {
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
        decimals: number = 3

    ): ApacheArrow.Table<T> {

        if (!amountOfRows) {
            amountOfRows = table.numRows;
        }

        const latCol = table.getChild(latitudeColumnName);
        const lonCol = table.getChild(longitudeColumnName);

        const seen = new Set<string>();
        const keepIndexes: number[] = [];

        // Efficiently iterate column-wise
        for (let i = 0; i < amountOfRows; i++) {
            const lat: number = latCol?.get(i);
            const lon: number = lonCol?.get(i);

            // Optional: round coordinates to avoid floating-point noise
            const key = `${lat.toFixed(decimals)},${lon.toFixed(decimals)}`;

            if (!seen.has(key)) {
                seen.add(key);
                keepIndexes.push(i);
            }
        }

        console.log(`Deduplicated from ${amountOfRows} to ${keepIndexes.length} rows (${latitudeColumnName}, ${longitudeColumnName})`,);

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

