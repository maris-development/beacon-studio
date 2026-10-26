import { describe, expect, it } from "vitest";
import { nodeHost } from "../beacon-node-url";

describe("nodeHost", () => {
    it("returns the host of a node URL", () => {
        expect(nodeHost("https://beacon-era5.maris.nl")).toBe("beacon-era5.maris.nl");
        expect(nodeHost("https://beacon.maris.nl/beacon-api")).toBe("beacon.maris.nl");
    });

    it("keeps the port", () => {
        expect(nodeHost("http://localhost:5001")).toBe("localhost:5001");
    });

    it("returns the input when it does not parse", () => {
        expect(nodeHost("not a url")).toBe("not a url");
    });
});
