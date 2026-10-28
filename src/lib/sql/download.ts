import type { SimpleOutputFormat } from "@maris-development/beacon-client";

export interface DownloadFormat {
    label: string;
    format: SimpleOutputFormat;
    extension: string;
}

export const DOWNLOAD_FORMATS: DownloadFormat[] = [
    { label: "CSV", format: "csv", extension: "csv" },
    { label: "Parquet", format: "parquet", extension: "parquet" },
    { label: "Arrow IPC", format: "ipc", extension: "arrow" },
    { label: "NetCDF", format: "netcdf", extension: "nc" }
];

const SIMPLE_FORMATS: SimpleOutputFormat[] = ["csv", "ipc", "arrow", "parquet", "netcdf"];

/** The format as the SDK names it, or null for a format that has options. */
export function simpleFormatOf(value: string): SimpleOutputFormat | null {
    return SIMPLE_FORMATS.find((format) => format === value) ?? null;
}

/** The file extension of a format. `arrow` is the SDK alias of `ipc`. */
export function extensionOf(format: SimpleOutputFormat): string {
    let name = format;
    if (name === "arrow") name = "ipc";

    return DOWNLOAD_FORMATS.find((entry) => entry.format === name)?.extension ?? name;
}

function stampOf(now: Date): string {
    return now.toISOString().slice(0, 19).replace(/:/g, "-");
}

export function downloadFileName(format: DownloadFormat, now: Date): string {
    return `query-${stampOf(now)}.${format.extension}`;
}

export function formatFileName(format: SimpleOutputFormat, now: Date): string {
    return `query-${stampOf(now)}.${extensionOf(format)}`;
}
