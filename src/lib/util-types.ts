/* eslint-disable @typescript-eslint/no-explicit-any */

export type SortDirection = 'asc' | 'desc';
export type Column = { key: string; header: string; sortable: boolean, rawHtml?: boolean, ref?: HTMLElement, isSorted?: boolean, sortDirection?: SortDirection };
export type Rendered = { element: HTMLElement; handle: Record<string, any>, container: HTMLDivElement };

export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
