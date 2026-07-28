import type { CompiledQuery } from '@/beacon-api/types';

export type ActionCallback = (() => void | Promise<void>) | undefined;

export type QuerySelectionActions = {
    compileQuery?: (() => CompiledQuery) | undefined;   // returns function compile query
    downloadData?: ActionCallback;   // returns function download data
    visualiseTable?: ActionCallback; // links to visualise data in table page
    visualiseChart?: ActionCallback; // links to visualise data in chart page
    visualiseMap?: ActionCallback;   // links to visualise data in map page
    saveQuery?: ActionCallback;   // links to visualise data in map page
    resetQuery?: ActionCallback;          // reset query selection
};

export function makeEmptyQuerySelectionActions(): QuerySelectionActions {
    return {
        compileQuery: undefined,
        downloadData: undefined,
        visualiseTable: undefined,
        visualiseChart: undefined,
        visualiseMap: undefined,
        saveQuery: undefined,
        resetQuery: undefined
    };
}