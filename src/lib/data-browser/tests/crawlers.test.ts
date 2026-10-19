import { describe, expect, it } from "vitest";
import { translate } from "@/i18n";
import {
    CRAWLER_FORMATS,
    crawlerErrors,
    crawlerRequest,
    describeFormats,
    describeSchedule,
    emptyCrawlerForm,
    folderHasFiles,
    formFromCrawler,
    optionsToText,
    parseCrawlers,
    parseTableOptions,
    tableNameExample,
    unknownFormats,
    type Crawler
} from "../crawlers";

const placeholders = { folder: "<folder>", crawler: "<crawler>" };

const server = {
    name: "argo",
    target_prefix: "argo/",
    format_filter: ["parquet", "nc"],
    table_naming: "crawler_prefixed",
    detect_partitions: true,
    schedule_secs: 21600,
    event_driven: true,
    options: { read_dimensions: "lat,lon" }
};

const crawler: Crawler = {
    name: "argo",
    targetPrefix: "argo/",
    formatFilter: ["parquet", "nc"],
    tableNaming: "crawler_prefixed",
    detectPartitions: true,
    scheduleSecs: 21600,
    eventDriven: true,
    options: { read_dimensions: "lat,lon" }
};

describe("parseCrawlers", () => {
    it("reads the server view and drops bad entries", () => {
        expect(parseCrawlers([server, { nope: 1 }, "junk"])).toEqual([crawler]);
    });

    it("fills defaults for missing fields", () => {
        expect(parseCrawlers([{ name: "x", target_prefix: "x/" }])).toEqual([
            {
                name: "x",
                targetPrefix: "x/",
                formatFilter: null,
                tableNaming: "leaf_prefix",
                detectPartitions: true,
                scheduleSecs: null,
                eventDriven: false,
                options: {}
            }
        ]);
    });
});

describe("form round trip", () => {
    it("gives the same request after load and save, with replace", () => {
        const request = crawlerRequest(formFromCrawler(crawler), true);
        expect(request).toEqual({ ...server, replace: true });
    });

    it("shows the stored options as key=value lines", () => {
        expect(formFromCrawler(crawler).optionsText).toBe("read_dimensions=lat,lon");
    });
});

describe("parseTableOptions", () => {
    it("reads key=value lines, skips empty lines, trims, splits on the first =", () => {
        expect(parseTableOptions("read_dimensions=lat,lon\r\n\n  b = x=y  \n").options).toEqual({
            read_dimensions: "lat,lon",
            b: "x=y"
        });
    });

    it("gives one error for each bad line, with its line number", () => {
        const { options, errors } = parseTableOptions("a=1\nnoequals\n=x");
        expect(options).toEqual({ a: "1" });
        expect(errors.map((error) => translate(error))).toEqual([
            "Line 2 has no =. Write key=value.",
            "Line 3 has no key. Write key=value."
        ]);
    });

    it("round-trips with optionsToText", () => {
        const options = { read_dimensions: "lat,lon", b: "x=y" };
        expect(optionsToText(options)).toBe("read_dimensions=lat,lon\nb=x=y");
        expect(parseTableOptions(optionsToText(options)).options).toEqual(options);
    });
});

describe("timer", () => {
    it("sends no schedule for an empty timer", () => {
        expect(
            crawlerRequest({ ...emptyCrawlerForm(), timer: null }, false).schedule_secs
        ).toBeNull();
    });

    it("shows a stored schedule in seconds, and sends it back exact", () => {
        const form = formFromCrawler({ ...crawler, scheduleSecs: 900 });
        expect(form.timer).toBe(900);
        expect(crawlerRequest(form, true).schedule_secs).toBe(900);
        expect(formFromCrawler({ ...crawler, scheduleSecs: null }).timer).toBeNull();
    });

    it.each([0, -5, 59, 90.5])("rejects a timer of %s", (timer) => {
        const form = { ...emptyCrawlerForm(), name: "a", folder: "a/", timer };
        expect(crawlerErrors(form).map((error) => translate(error))).toEqual([
            "Enter a schedule of at least 60 seconds."
        ]);
    });

    it("flags a stored schedule below the minimum on Edit", () => {
        expect(crawlerErrors(formFromCrawler({ ...crawler, scheduleSecs: 30 }))).toHaveLength(1);
    });
});

describe("event_driven", () => {
    it("follows the checkbox", () => {
        expect(
            crawlerRequest({ ...emptyCrawlerForm(), eventDriven: true }, false).event_driven
        ).toBe(true);
        expect(crawlerRequest(emptyCrawlerForm(), false).event_driven).toBe(false);
        expect(crawlerRequest(formFromCrawler(crawler), true).event_driven).toBe(true);
    });
});

describe("crawlerRequest", () => {
    it("sends null formats for none checked, no schedule, and no empty options", () => {
        const form = {
            ...emptyCrawlerForm(),
            name: " wod ",
            folder: "/wod",
            optionsText: "\n  \n"
        };
        expect(crawlerRequest(form, false)).toEqual({
            name: "wod",
            target_prefix: "wod/",
            format_filter: null,
            table_naming: "leaf_prefix",
            detect_partitions: true,
            schedule_secs: null,
            event_driven: false,
            options: {},
            replace: false
        });
    });
});

describe("crawlerErrors", () => {
    it("asks for a name, a folder, a timer of at least a minute and valid options", () => {
        const form = { ...emptyCrawlerForm(), timer: 0, optionsText: "x" };
        expect(crawlerErrors(form).map((error) => translate(error))).toEqual([
            "Enter a crawler name.",
            "Pick a folder.",
            "Enter a schedule of at least 60 seconds.",
            "Line 1 has no =. Write key=value."
        ]);
        expect(crawlerErrors({ ...formFromCrawler(crawler), timer: 90 })).toEqual([]);
    });

    it("accepts a complete form", () => {
        expect(crawlerErrors(formFromCrawler(crawler))).toEqual([]);
    });
});

describe("display", () => {
    it("describes a schedule", () => {
        expect(translate(describeSchedule(null))).toBe("Only on Run");
        expect(translate(describeSchedule(3600))).toBe("Every hour");
        expect(translate(describeSchedule(21600))).toBe("Every 6 hours");
        expect(translate(describeSchedule(60))).toBe("Every minute");
        expect(translate(describeSchedule(900))).toBe("Every 15 minutes");
        expect(translate(describeSchedule(90))).toBe("Every 90 seconds");
    });

    it("describes formats with labels", () => {
        expect(translate(describeFormats(null))).toBe("All formats");
        expect(translate(describeFormats(["nc", "parquet"]))).toBe("NetCDF, Parquet");
        expect(translate(describeFormats(["xyz"]))).toBe("xyz");
    });

    it("gives a table name example for both naming modes", () => {
        const form = { ...emptyCrawlerForm(), name: "argo", folder: "data/floats/" };
        expect(tableNameExample(form, placeholders)).toBe("floats");
        expect(tableNameExample({ ...form, naming: "crawler_prefixed" }, placeholders)).toBe(
            "argo_floats"
        );
        expect(tableNameExample({ ...form, folder: "" }, placeholders)).toBe("<folder>");
        expect(
            tableNameExample(
                { ...form, name: " ", folder: "", naming: "crawler_prefixed" },
                placeholders
            )
        ).toBe("<crawler>_<folder>");
    });

    it("slugifies the example like the server", () => {
        const form = { ...emptyCrawlerForm(), name: "Argo Floats", folder: "My Data/" };
        expect(tableNameExample(form, placeholders)).toBe("my_data");
        expect(tableNameExample({ ...form, naming: "crawler_prefixed" }, placeholders)).toBe(
            "argo_floats_my_data"
        );
        expect(tableNameExample({ ...form, folder: "a--b/Été 2024!/" }, placeholders)).toBe(
            "t__2024"
        );
    });

    it("falls back to the crawler name when the folder has no usable character", () => {
        const form = { ...emptyCrawlerForm(), name: "Argo Floats", folder: "---/" };
        expect(tableNameExample(form, placeholders)).toBe("argo_floats");
        expect(tableNameExample({ ...form, naming: "crawler_prefixed" }, placeholders)).toBe(
            "argo_floats"
        );
    });

    it("lists the formats that a crawler can find, with the server names", () => {
        expect(CRAWLER_FORMATS.map((format) => format.value)).toEqual([
            "parquet",
            "geoparquet",
            "nc",
            "hdf5",
            "csv",
            "arrow",
            "tiff",
            "bbf",
            "atlas"
        ]);
    });

    it("finds stored formats that the list no longer holds", () => {
        expect(unknownFormats(["parquet", "zarr", "odv"])).toEqual(["zarr", "odv"]);
        expect(unknownFormats(["nc"])).toEqual([]);
        expect(unknownFormats([])).toEqual([]);
    });

    it("checks that a folder holds files", () => {
        expect(folderHasFiles("argo/", ["argo/a.nc"])).toBe(true);
        expect(folderHasFiles("argo", ["argos/a.nc"])).toBe(false);
        expect(folderHasFiles("", ["a.nc"])).toBe(true);
    });

    it("does not warn about an empty folder when the list is cut, and ignores a leading slash", () => {
        expect(folderHasFiles("argo/", [], true)).toBe(true);
        expect(folderHasFiles("argo/", ["/argo/a.nc"])).toBe(true);
    });
});
