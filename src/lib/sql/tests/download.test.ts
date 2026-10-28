import { describe, expect, it } from "vitest";
import {
    DOWNLOAD_FORMATS,
    downloadFileName,
    extensionOf,
    formatFileName,
    simpleFormatOf
} from "../download";

describe("downloads", () => {
    it("offers the four formats", () => {
        expect(DOWNLOAD_FORMATS.map((format) => format.label)).toEqual([
            "CSV",
            "Parquet",
            "Arrow IPC",
            "NetCDF"
        ]);
    });

    it("names the file after the time", () => {
        const arrow = DOWNLOAD_FORMATS.find((format) => format.label === "Arrow IPC")!;
        expect(downloadFileName(arrow, new Date("2026-10-06T11:44:05.123Z"))).toBe(
            "query-2026-10-06T11-44-05.arrow"
        );
    });

    it("gives the extension of each format", () => {
        expect(extensionOf("csv")).toBe("csv");
        expect(extensionOf("arrow")).toBe("arrow");
        expect(extensionOf("ipc")).toBe("arrow");
        expect(extensionOf("netcdf")).toBe("nc");
        expect(formatFileName("parquet", new Date("2026-10-06T11:44:05.123Z"))).toBe(
            "query-2026-10-06T11-44-05.parquet"
        );
    });

    it("knows the formats of the SDK only", () => {
        expect(simpleFormatOf("parquet")).toBe("parquet");
        expect(simpleFormatOf("geoparquet")).toBeNull();
    });
});
