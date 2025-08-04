import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from 'uuid';
import type { DataType } from "./beacon-api/models/misc";
import type { ParameterFilterType } from "./components/query-builder/advanced-parameter-filter.svelte";
import type { Filter } from "./beacon-api/query";

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
        url.searchParams.set(parameterName, String(pageIndex));
        window.history.replaceState({}, '', url.toString());
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
}