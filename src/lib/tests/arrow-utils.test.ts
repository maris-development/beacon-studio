import { describe, expect, it } from "vitest";
import * as ApacheArrow from "apache-arrow";
import { ApacheArrowUtils } from "../arrow-utils";

const toText = ApacheArrowUtils.typedValueToString;

describe("typedValueToString", () => {
    it("shows a timestamp as an ISO string", () => {
        const millis = Date.UTC(1991, 1, 3, 19, 14, 0, 2);
        expect(toText(millis, new ApacheArrow.TimestampMillisecond())).toBe(
            "1991-02-03T19:14:00.002Z"
        );
    });

    it("shows a date as YYYY-MM-DD", () => {
        expect(toText(Date.UTC(2020, 5, 16), new ApacheArrow.DateDay())).toBe("2020-06-16");
    });

    it("keeps an out-of-range timestamp as a number", () => {
        expect(toText(Number.MAX_VALUE, new ApacheArrow.TimestampMillisecond())).toBe(
            String(Number.MAX_VALUE)
        );
    });

    it("shows a 32-bit float without float noise", () => {
        const type = new ApacheArrow.Float32();
        expect(toText(Math.fround(0.6), type)).toBe("0.6");
        expect(toText(Math.fround(47.5467), type)).toBe("47.5467");
        expect(toText(Math.fround(-1.5499999523162842), type)).toBe("-1.55");
    });

    it("keeps every digit of a 64-bit float", () => {
        expect(toText(0.6000000238418579, new ApacheArrow.Float64())).toBe("0.6000000238418579");
    });

    it("reads the value type of a dictionary", () => {
        const type = new ApacheArrow.Dictionary(new ApacheArrow.Float32(), new ApacheArrow.Int32());
        expect(toText(Math.fround(0.6), type)).toBe("0.6");
    });

    it("shows null as empty, and a bigint and an object as text", () => {
        expect(toText(null, new ApacheArrow.Utf8())).toBe("");
        expect(toText(12n, new ApacheArrow.Int64())).toBe("12");
        expect(toText({ a: 1n }, new ApacheArrow.Null())).toBe('{"a":"1"}');
    });

    it("keeps a null cell as null in a record", () => {
        const schema = new ApacheArrow.Schema([
            new ApacheArrow.Field("name", new ApacheArrow.Utf8()),
            new ApacheArrow.Field("depth", new ApacheArrow.Float32())
        ]);
        expect(ApacheArrowUtils.arrayToRecord([null, Math.fround(0.6)], schema)).toEqual({
            name: null,
            depth: "0.6"
        });
        expect(ApacheArrowUtils.arrayToRecord(["", undefined], schema)).toEqual({
            name: "",
            depth: null
        });
    });

    it("shows a struct as JSON", () => {
        const type = new ApacheArrow.Struct([]);
        expect(toText({ x: 1, y: 2 }, type)).toBe('{"x":1,"y":2}');
    });
});

describe("groupByCoordinate", () => {
    const group = (columns: Record<string, unknown[]>) => {
        const table = new ApacheArrow.Table({
            lat: ApacheArrow.vectorFromArray(columns.lat, new ApacheArrow.Float64()),
            lon: ApacheArrow.vectorFromArray(columns.lon, new ApacheArrow.Float64()),
            temp: ApacheArrow.vectorFromArray(columns.temp, new ApacheArrow.Float64()),
            name: ApacheArrow.vectorFromArray(columns.name, new ApacheArrow.Utf8())
        });
        const grouped = ApacheArrowUtils.groupByCoordinate(table, "lat", "lon", 3);
        return grouped.toArray().map((row) => row.toJSON());
    };

    it("takes the first present value of each column in a group", () => {
        const rows = group({
            lat: [61.32, 61.32, 62, 62],
            lon: [-56.396, -56.396, -50, -50],
            temp: [null, 7.172, null, 4.5],
            name: ["a", null, "c", "d"]
        });

        expect(rows).toEqual([
            { lat: 61.32, lon: -56.396, temp: 7.172, name: "a" },
            { lat: 62, lon: -50, temp: 4.5, name: "c" }
        ]);
    });

    it("keeps null when a group has no present value", () => {
        const rows = group({
            lat: [1, 1],
            lon: [2, 2],
            temp: [null, null],
            name: ["a", "b"]
        });

        expect(rows).toEqual([{ lat: 1, lon: 2, temp: null, name: "a" }]);
    });

    it("skips NaN as a missing value", () => {
        const rows = group({
            lat: [1, 1],
            lon: [2, 2],
            temp: [NaN, 3],
            name: ["a", "b"]
        });

        expect(rows[0].temp).toBe(3);
    });

    it("gives one row per rounded coordinate", () => {
        const rows = group({
            lat: [1.0001, 1.0002, 1.01, 1.0003],
            lon: [2, 2, 2, 2],
            temp: [1, 2, 3, 4],
            name: ["a", "b", "c", "d"]
        });

        expect(rows.map((row) => row.temp)).toEqual([1, 3]);
    });
});

describe("coordinateKey", () => {
    it("rounds both coordinates", () => {
        expect(ApacheArrowUtils.coordinateKey(1.00049, -2.5, 3)).toBe("1.000,-2.500");
    });

    it("gives null for a missing or non-finite coordinate", () => {
        expect(ApacheArrowUtils.coordinateKey(null, 2, 3)).toBeNull();
        expect(ApacheArrowUtils.coordinateKey(1, undefined, 3)).toBeNull();
        expect(ApacheArrowUtils.coordinateKey(NaN, 2, 3)).toBeNull();
        expect(ApacheArrowUtils.coordinateKey(1, Infinity, 3)).toBeNull();
    });
});

describe("groupByCoordinate with missing values", () => {
    const table = new ApacheArrow.Table({
        lat: ApacheArrow.vectorFromArray([null, 1, 1, NaN], new ApacheArrow.Float64()),
        lon: ApacheArrow.vectorFromArray([2, 2, 2, 2], new ApacheArrow.Float64()),
        empty: ApacheArrow.vectorFromArray([null, null, null, null], new ApacheArrow.Float64()),
        temp: ApacheArrow.vectorFromArray([9, null, 3, 8], new ApacheArrow.Float64())
    });

    it("leaves out a row without a coordinate", () => {
        const rows = ApacheArrowUtils.groupByCoordinate(table, "lat", "lon", 3)
            .toArray()
            .map((row) => row.toJSON());

        expect(rows).toEqual([{ lat: 1, lon: 2, empty: null, temp: 3 }]);
    });

    it("finds no rows for a missing search coordinate, and skips rows without one", () => {
        expect(ApacheArrowUtils.findSimilarRowsByLatLon(table, [NaN, 2], 3, "lat", "lon")).toEqual(
            []
        );
        expect(
            ApacheArrowUtils.findSimilarRowsByLatLon(table, [1, 2], 3, "lat", "lon")
        ).toHaveLength(2);
    });
});
