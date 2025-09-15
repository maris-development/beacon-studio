/* eslint-disable @typescript-eslint/no-unused-vars */
import * as ApacheArrow from 'apache-arrow';
import { clsx, type ClassValue } from "clsx";
import pako from "pako";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from 'uuid';
import type { CompiledQuery, DataType, Filter } from "./beacon-api/types";
import type { ParameterFilterType } from "./components/query-builder/advanced-parameter-filter.svelte";
import * as Navigation from "$app/navigation";
import { mount, type Component } from 'svelte';
import { ApacheArrowUtils } from './arrow-utils';
import type { Rendered, SortDirection } from './util-types';
import { page } from '$app/state';
import { get, type Readable } from "svelte/store";

// import * as aq from 'arquero';
// Or in browser: aq.loadArrow(...)

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}


export class Utils {

    // Not actually random! Dont use for security/cryptographic purposes!
    static randomUUID(){
        // Generate a random-like UUID (version 4) without using crypto API
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }


    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Creates a deep clone of the provided value, attempting to preserve complex types such as Dates, Maps, and Sets.
     * 
     * The cloning process follows these steps:
     * 1. Attempts to use `structuredClone` for a deep and accurate clone.
     * 2. Falls back to `JSON.parse(JSON.stringify(value))` for JSON-serializable objects, which removes proxies and non-serializable properties.
     * 3. As a last resort, performs a shallow clone using object spread.
     * 
     * @typeParam T - The type of the value to clone.
     * @param value - The value or Svelte `Readable` store to clone.
     * @returns A cloned copy of the input value.
     * @remarks
     * - If all cloning methods fail, a shallow clone is returned and a warning is logged.
     * - Non-serializable properties may be lost if the fallback methods are used.
     */
    static cloneObject<T>(value: T | Readable<T>): T {
        // 1) Best: structuredClone (fast, preserves Dates/Maps/Sets, etc.)
        try {
            const maybeObject = value as T;
            return structuredClone(maybeObject);
        } catch {
            // ignored
        }

        // 2) If it’s JSON-like, this blows away proxies reliably
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            // ignored
        }

        // 3) Last resort, shallow clone
        const clone = { ...value } as T;

        console.warn('cloneObject: shallow clone', clone)

        return clone
    }

    static objectHasProperty<T,K extends PropertyKey>(obj: T, prop: K): obj is T & Record<K, unknown> {
        return typeof obj === "object" && obj !== null && prop in obj;
    }

    static getUrlSuppliedQuery(): CompiledQuery | null {
        const urlSuppliedQuery = page.url.searchParams.get('query');

        let query: CompiledQuery | null = null;

        if (urlSuppliedQuery) {
            try {
                query = Utils.gzipStringToObject(urlSuppliedQuery);
            } catch (error) {
                console.error('Failed to decode query:', error);
            }
        }

        return query;
    }

    static renderComponent<T extends Record<string, unknown>>(
        component: Component<T, Record<string, unknown>, string>,
        props: T = {} as T
    ): Rendered {
        const container = document.createElement('div');

        const handle = mount(component, {
            target: container,
            props: props
        });
    

        return {
            element: container,
            handle,
            container
        };
    }

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

    static isNumericDataType(datatype: DataType): boolean {
        return ['Int32', 'Int8', 'Float32', 'Float64'].includes(datatype as string);
    }

    static isStringDataType(datatype: DataType): boolean {
        return datatype === 'Utf8';
    }

    static isTimestampDataType(datatype: DataType): boolean {
        return typeof datatype === 'object' && 'Timestamp' in datatype;
    }

    static parameterFilterTypeToFilter(filter: ParameterFilterType, column: string): Filter {
        switch (filter.type) {
            case "range_numeric": return {
                for_query_parameter: column,
                min: filter.min,
                max: filter.max
            };
            case "equals_numeric":
                return { for_query_parameter: column, eq: filter.value };
            case "not_equals_numeric":
                return { for_query_parameter: column, neq: filter.value };
            case "greater_than_numeric":
                return { for_query_parameter: column, gt: filter.value };
            case "greater_than_or_equals_numeric":
                return { for_query_parameter: column, gt_eq: filter.value };
            case "less_than_numeric":
                return { for_query_parameter: column, lt: filter.value };
            case "less_than_or_equals_numeric":
                return { for_query_parameter: column, lt_eq: filter.value };
            case "range_string":
                return {
                    for_query_parameter: column,
                    min: filter.min,
                    max: filter.max
                };
            case "equals_string":
                return { for_query_parameter: column, eq: filter.value };
            case "not_equals_string":
                return { for_query_parameter: column, neq: filter.value };
            case "greater_than_string":
                return { for_query_parameter: column, gt: filter.value };
            case "greater_than_or_equals_string":
                return { for_query_parameter: column, gt_eq: filter.value };
            case "less_than_string":
                return { for_query_parameter: column, lt: filter.value };
            case "less_than_or_equals_string":
                return { for_query_parameter: column, lt_eq: filter.value };

            case "range_timestamp":
                return {
                    for_query_parameter: column,
                    min: filter.min.toString(),
                    max: filter.max.toString()
                };
            case "equals_timestamp":
                return { for_query_parameter: column, eq: filter.value.toString() };

            case "not_equals_timestamp":
                return { for_query_parameter: column, neq: filter.value.toString() };

            case "greater_than_timestamp":
                return { for_query_parameter: column, gt: filter.value.toString() };

            case "greater_than_or_equals_timestamp":
                return { for_query_parameter: column, gt_eq: filter.value.toString() };

            case "less_than_timestamp":
                return { for_query_parameter: column, lt: filter.value.toString() };

            case "less_than_or_equals_timestamp":
                return { for_query_parameter: column, lt_eq: filter.value.toString() };

            case "is_null":
                return { is_null: { for_query_parameter: column } };
            case "is_not_null":
                return { is_not_null: { for_query_parameter: column } };
        }
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

    static formatBytes(bytes: number, decimals = 2): string {
		if (bytes === 0) return '0 Bytes';

		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));
		return `${value} ${sizes[i]}`;
	}

    static formatSecondsToReadableTime(totalSeconds: number): string {
		const units = [
			{ label: 'months', value: 60 * 60 * 24 * 30 },
			{ label: 'days', value: 60 * 60 * 24 },
			{ label: 'hours', value: 60 * 60 },
			{ label: 'minutes', value: 60 },
			{ label: 'seconds', value: 1 }
		];

        //get decimals, times 1000:
        const totalMilliseconds: number = (totalSeconds % 1) * 1000;

        if(totalSeconds < 60){
            return `${Math.floor(totalSeconds)}.${String(totalMilliseconds.toFixed(0)).padStart(3, '0')}s`;
        }

        const values: number[] = [];

		for (const unit of units) {
			const amount = Math.floor(totalSeconds / unit.value);
			values.push(amount);
			totalSeconds %= unit.value;
		}

		// Remove leading zeros, but leave at least minutes and seconds
		while (values.length > 2 && values[0] === 0) {
			values.shift();
		}

		let timeString = values.map((v) => String(v).padStart(2, '0')).join(':');

        if (totalMilliseconds > 0) {
            const milliseconds = Math.floor(totalMilliseconds);
            timeString += `.${String(milliseconds).padStart(3, '0')}`;
        }

		return timeString;
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

    static orderTableByColumn<Row = unknown>(data: Row[], column: keyof Row, direction: SortDirection): Row[] {

        let isNumeric = false;
        let isBoolean = false;
        let isObject = false;
        let isString = false;

        if (data.length > 0) {
            const firstRow = data[0];
            const value = firstRow[column];

            isNumeric = typeof value === 'number';
            isBoolean = typeof value === 'boolean';
            isObject = typeof value === 'object';
            isString = typeof value === 'string';
        }

        if(isObject){
            console.warn('Sorting column with values of type object is not supported.');
            return data;
        }

        if (isNumeric) {
            data.sort((a, b) => {
                const aValue = a[column] as number;
                const bValue = b[column] as number;

                if (direction === 'asc') {
                    return aValue - bValue;
                } else {
                    return bValue - aValue;
                }
            });

        } else if(isBoolean){
            data.sort((a, b) => {
                const aValue = a[column] as boolean;
                const bValue = b[column] as boolean;

                if (direction === 'asc') {
                    return aValue === bValue ? 0 : aValue ? 1 : -1;
                } else {
                    return aValue === bValue ? 0 : aValue ? -1 : 1;
                }
            });

        } else if(isString) {
            data.sort((a, b) => {
                const aValue = a[column] as string;
                const bValue = b[column] as string;

                if (direction === 'asc') {
                    return aValue.localeCompare(bValue);
                } else {
                    return bValue.localeCompare(aValue);
                }
            });

        }



        return data.copyWithin(data.length, 0);
    }
}

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

    sortColumn: keyof Row | null = null;
    sortDirection: SortDirection | null = null;

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

    orderBy(column: keyof Row, direction: SortDirection) {
        this.sortColumn = column;
        this.sortDirection = direction;


        this.data = Utils.orderTableByColumn(
            this.data,
            column,
            direction,
        );
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