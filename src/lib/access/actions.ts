import type { AdminClient, AuthRole, AuthRule } from "@maris-development/beacon-client";
import { targetOf } from "./summary";

export type AuthAdmin = Pick<
    AdminClient,
    "createUser" | "grantRoleToUser" | "createRole" | "grantPrivilege"
>;

export type StepFailure = { step: string; error: unknown };

/** The error toast for the steps that failed after the first step. The caller formats the error. */
export function stepFailureToast(failures: StepFailure[], describe: (error: unknown) => string) {
    return {
        type: "error" as const,
        key: "usersRoles.partialFailed" as const,
        values: { count: failures.length, steps: failures.map((item) => item.step).join(", ") },
        message: describe(failures[0].error)
    };
}

/** Create a user, then grant each role. A failed grant is recorded and the loop goes on. */
export async function createUserWithRoles(
    admin: AuthAdmin,
    username: string,
    password: string,
    roles: string[]
): Promise<StepFailure[]> {
    await admin.createUser(username, password);
    const failures: StepFailure[] = [];
    for (const role of roles) {
        try {
            await admin.grantRoleToUser(username, role);
        } catch (error) {
            failures.push({ step: role, error });
        }
    }
    return failures;
}

/** Create a role, then copy the grants and denies of the source. A failed copy is recorded. */
export async function createRoleFrom(
    admin: AuthAdmin,
    name: string,
    source: AuthRole | null
): Promise<StepFailure[]> {
    await admin.createRole(name);
    const failures: StepFailure[] = [];
    if (!source) return failures;
    const steps: { rule: AuthRule; deny: boolean }[] = [
        ...source.grants.map((rule) => ({ rule, deny: false })),
        ...source.denies.map((rule) => ({ rule, deny: true }))
    ];
    for (const { rule, deny } of steps) {
        try {
            await admin.grantPrivilege(name, targetOf(rule), deny);
        } catch (error) {
            const step =
                `${deny ? "deny" : "grant"} ${rule.target_type} ${rule.target_value ?? ""}`.trim();
            failures.push({ step, error });
        }
    }
    return failures;
}
