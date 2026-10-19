import { describe, expect, it } from "vitest";
import type { AuthRule } from "@maris-development/beacon-client";
import { createRoleFrom, createUserWithRoles, stepFailureToast, type AuthAdmin } from "../actions";

const all: AuthRule = { privilege: "SELECT", target_type: "all", target_value: null };
const tablePriv = (value: string): AuthRule => ({
    privilege: "SELECT",
    target_type: "table",
    target_value: value
});

type Options = { failGrantRole?: string; failCreate?: boolean; failPrivilegeType?: string };

function fake(options: Options): AuthAdmin & { calls: unknown[][] } {
    const calls: unknown[][] = [];
    return {
        calls,
        async createUser(username: string, password: string) {
            calls.push(["createUser", username, password]);
            if (options.failCreate) throw new Error("create failed");
        },
        async grantRoleToUser(username: string, role: string) {
            calls.push(["grantRoleToUser", username, role]);
            if (role === options.failGrantRole) throw new Error("grant failed");
        },
        async createRole(role: string) {
            calls.push(["createRole", role]);
            if (options.failCreate) throw new Error("create failed");
        },
        async grantPrivilege(
            role: string,
            target: { type: string; value?: string },
            deny?: boolean
        ) {
            calls.push(["grantPrivilege", role, target, deny]);
            if (target.type === options.failPrivilegeType) throw new Error("privilege failed");
        }
    } as AuthAdmin & { calls: unknown[][] };
}

describe("createUserWithRoles", () => {
    it("creates the user, then grants each role, and goes on after a failure", async () => {
        const admin = fake({ failGrantRole: "b" });
        const failures = await createUserWithRoles(admin, "jane", "pw", ["a", "b", "c"]);
        expect(failures.map((f) => f.step)).toEqual(["b"]);
        expect(admin.calls).toEqual([
            ["createUser", "jane", "pw"],
            ["grantRoleToUser", "jane", "a"],
            ["grantRoleToUser", "jane", "b"],
            ["grantRoleToUser", "jane", "c"]
        ]);
    });

    it("stops when createUser fails", async () => {
        const admin = fake({ failCreate: true });
        await expect(createUserWithRoles(admin, "jane", "pw", ["a"])).rejects.toThrow();
        expect(admin.calls).toEqual([["createUser", "jane", "pw"]]);
    });
});

describe("createRoleFrom", () => {
    it("copies the grants and the denies of the source role", async () => {
        const admin = fake({});
        const failures = await createRoleFrom(admin, "copy", {
            name: "src",
            grants: [all],
            denies: [tablePriv("secret")]
        });
        expect(failures).toEqual([]);
        expect(admin.calls).toEqual([
            ["createRole", "copy"],
            ["grantPrivilege", "copy", { type: "all" }, false],
            ["grantPrivilege", "copy", { type: "table", value: "secret" }, true]
        ]);
    });

    it("creates an empty role from null", async () => {
        const admin = fake({});
        expect(await createRoleFrom(admin, "x", null)).toEqual([]);
        expect(admin.calls).toEqual([["createRole", "x"]]);
    });

    it("records a failed copy and goes on", async () => {
        const admin = fake({ failPrivilegeType: "all" });
        const failures = await createRoleFrom(admin, "copy", {
            name: "src",
            grants: [all],
            denies: [tablePriv("secret")]
        });
        expect(failures.map((f) => f.step)).toEqual(["grant all"]);
        expect(admin.calls).toHaveLength(3);
    });

    it("names a deny step with its type and value", async () => {
        const admin = fake({ failPrivilegeType: "table" });
        const failures = await createRoleFrom(admin, "copy", {
            name: "src",
            grants: [],
            denies: [tablePriv("secret")]
        });
        expect(failures.map((f) => f.step)).toEqual(["deny table secret"]);
    });

    it("stops when createRole fails", async () => {
        await expect(createRoleFrom(fake({ failCreate: true }), "x", null)).rejects.toThrow();
    });
});

describe("stepFailureToast", () => {
    it("lists the failed steps and describes the first error", () => {
        const first = new Error("one");
        const toast = stepFailureToast(
            [
                { step: "a", error: first },
                { step: "b", error: new Error("two") }
            ],
            (error) => (error === first ? "first" : "other")
        );
        expect(toast).toEqual({
            type: "error",
            key: "usersRoles.partialFailed",
            values: { count: 2, steps: "a, b" },
            message: "first"
        });
    });
});
