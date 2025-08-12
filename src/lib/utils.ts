/* eslint-disable @typescript-eslint/no-unused-vars */
import * as ApacheArrow from 'apache-arrow';
import { clsx, type ClassValue } from "clsx";
import pako from "pako";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from 'uuid';
import type { DataType, Filter } from "./beacon-api/types";
import type { ParameterFilterType } from "./components/query-builder/advanced-parameter-filter.svelte";
import * as Navigation from "$app/navigation";
import { mount, type Component } from 'svelte';
import { ApacheArrowUtils } from './arrow-utils';
import type { SortDirection } from './util-types';


// import * as aq from 'arquero';
// Or in browser: aq.loadArrow(...)

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export class Utils {

    static renderComponent<T extends Record<string, unknown>>(
        component: Component<T, Record<string, unknown>, string>,
        props: T = {} as T
    ): HTMLElement {
        const container = document.createElement('div');

        mount(component, {
            target: container,
            props: props
        });

        return container.firstElementChild as HTMLElement;
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