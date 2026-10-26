import { describe, expect, it } from "vitest";
import { isItemActive, isLocked, isPathActive, visibleGroups, type Group } from "../menu";

const groups: Group[] = [
    {
        title: "nav.group.nodeManagement",
        items: [
            {
                title: "nav.item.dataBrowser",
                url: "/data-browser",
                icon: null,
                children: [
                    { title: "nav.item.datasets", url: "/data-browser/datasets" },
                    { title: "nav.item.crawlers", url: "/data-browser/crawlers", adminOnly: true }
                ]
            },
            { title: "nav.item.systemInfo", url: "/system-info", icon: null, adminOnly: true }
        ]
    },
    {
        title: "nav.group.studio",
        items: [{ title: "nav.item.settings", url: "/settings", icon: null, adminOnly: true }]
    }
];

describe("visibleGroups", () => {
    it("keeps every item with admin features on", () => {
        expect(visibleGroups(groups, true)).toEqual(groups);
    });

    it("hides admin items and empty groups with admin features off", () => {
        const result = visibleGroups(groups, false);

        expect(result).toHaveLength(1);
        expect(result[0].items.map((item) => item.title)).toEqual(["nav.item.dataBrowser"]);
        expect(result[0].items[0].children?.map((child) => child.title)).toEqual([
            "nav.item.datasets"
        ]);
    });
});

describe("isItemActive", () => {
    const dataBrowser = {
        url: "/data-browser",
        children: [{ url: "/data-browser/datasets" }, { url: "/data-browser/data-tables" }]
    };
    const crawlers = { url: "/data-browser/crawlers" };
    const workbench = { url: "/queries/workbench", match: "/queries" };
    const workspace = { url: "/visualisations/map-viewer", match: "/visualisations" };

    it("keeps Data Browser inactive on the Crawlers page", () => {
        expect(isItemActive("/data-browser/crawlers", dataBrowser)).toBe(false);
        expect(isItemActive("/data-browser/crawlers", crawlers)).toBe(true);
    });

    it("marks Data Browser active on its root and on a child sub-path", () => {
        expect(isItemActive("/data-browser", dataBrowser)).toBe(true);
        expect(isItemActive("/data-browser/datasets/detail", dataBrowser)).toBe(true);
    });

    it("marks Query Workbench active on every /queries route", () => {
        for (const path of ["/queries/workbench", "/queries/history", "/queries/query-editor"]) {
            expect(isItemActive(path, workbench)).toBe(true);
        }
    });

    it("marks Workspace active on all three viewers", () => {
        for (const path of [
            "/visualisations/map-viewer",
            "/visualisations/table-explorer",
            "/visualisations/chart-explorer"
        ]) {
            expect(isItemActive(path, workspace)).toBe(true);
        }
    });

    it("does not match a path that only shares a prefix", () => {
        expect(isPathActive("/settings-old", "/settings")).toBe(false);
    });
});

describe("isLocked", () => {
    it("locks an admin item with no session", () => {
        expect(isLocked({ adminOnly: true }, false)).toBe(true);
    });

    it("unlocks an admin item with a session", () => {
        expect(isLocked({ adminOnly: true }, true)).toBe(false);
    });

    it("never locks an item for everyone", () => {
        expect(isLocked({}, false)).toBe(false);
    });
});
