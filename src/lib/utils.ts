import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4 } from 'uuid';
import type { DataType } from "./beacon-api/models/misc";

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
}