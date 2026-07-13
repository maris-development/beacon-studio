import type { CompiledQuery } from '@/beacon-api/types';

export type ActionCallback = (() => void | Promise<void>) | undefined;

export type QuerySelectionActions = {
    compileQuery: ActionCallback;   // returns function compile query
    runQuery: ActionCallback;       // returns function run query
    downloadData: ActionCallback;   // returns function download data
    copyJson: ActionCallback;       // copy JSON to clipboard
    copyPython: ActionCallback;     // copy Python code to clipboard
    copySql: ActionCallback;        // copy SQL code to clipboard
    copyUrl: ActionCallback;        // copy query URL to clipboard
    visualiseTable: ActionCallback; // links to visualise data in table page
    visualiseChart: ActionCallback; // links to visualise data in chart page
    visualiseMap: ActionCallback;   // links to visualise data in map page
    saveQuery: ActionCallback;      // save query
    savedQueries: ActionCallback;   // select saved queries
    reset: ActionCallback;          // reset query selection
};