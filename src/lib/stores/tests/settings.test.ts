import { beforeEach, describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS, THEME_SETTINGS, getSettings, setSetting } from "../settings";

describe("adminFeatures setting", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("is on by default", () => {
        expect(getSettings().adminFeatures).toBe(true);
    });

    it("stores a new value", () => {
        setSetting("adminFeatures", false);
        expect(getSettings().adminFeatures).toBe(false);
        setSetting("adminFeatures", true);
    });

    it("has a definition in the System group", () => {
        const definition = SETTING_DEFINITIONS.find((d) => d.key === "adminFeatures");
        expect(definition).toMatchObject({
            group: "system",
            type: "boolean"
        });
    });
});

describe("theme setting", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("follows the system by default", () => {
        expect(getSettings().theme).toBe("system");
    });

    it("has a select definition in the General group with every theme", () => {
        const definition = SETTING_DEFINITIONS.find((d) => d.key === "theme");
        expect(definition).toMatchObject({ group: "general", type: "select" });
        if (definition?.type !== "select") return;
        expect(definition.options.map((option) => option.value)).toEqual([...THEME_SETTINGS]);
    });
});
