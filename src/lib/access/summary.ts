import type {
    AuthRole,
    AuthRule,
    AuthUser,
    PrivilegeTarget
} from "@maris-development/beacon-client";
import { message, type Message } from "@/i18n";

/** Dot colour of an access level: red, grey, green, amber. */
export type AccessTone = "full" | "none" | "all" | "limited";

export type AccessSummary = { tone: AccessTone; label: Message; line: Message; short: Message };

export type Totals = {
    users: number;
    localUsers: number;
    roles: number;
    usersWithRole: number;
    grants: number;
    denies: number;
};

export function accessSummary(user: AuthUser, roles: AuthRole[]): AccessSummary {
    if (user.is_super_user) {
        return {
            tone: "full",
            label: message("usersRoles.access.full.label"),
            line: message("usersRoles.access.full.line"),
            short: message("usersRoles.access.full.short")
        };
    }
    // A role name with no match counts as a role with no rules.
    const own = user.roles
        .map((name) => roles.find((role) => role.name === name))
        .filter((role): role is AuthRole => role !== undefined);
    const grants = own.reduce((sum, role) => sum + role.grants.length, 0);
    const denies = own.reduce((sum, role) => sum + role.denies.length, 0);
    if (user.roles.length === 0) {
        return noAccess("usersRoles.access.none.noRoles");
    }
    if (grants === 0) {
        return noAccess("usersRoles.access.none.noGrants");
    }
    const grantsAll = own.some((role) => role.grants.some((rule) => rule.target_type === "all"));
    if (grantsAll && denies === 0) {
        return {
            tone: "all",
            label: message("usersRoles.access.all.label"),
            line: message("usersRoles.access.all.line", { roles: user.roles.join(", ") }),
            short: message("usersRoles.access.all.short")
        };
    }
    return {
        tone: "limited",
        label: message("usersRoles.access.limited.label"),
        line: message("usersRoles.access.limited.line", { grants, denies }),
        short: message("usersRoles.access.limited.short")
    };
}

function noAccess(
    line: "usersRoles.access.none.noRoles" | "usersRoles.access.none.noGrants"
): AccessSummary {
    return {
        tone: "none",
        label: message("usersRoles.access.none.label"),
        line: message(line),
        short: message("usersRoles.access.none.short")
    };
}

/** The short access of the anonymous user, or "off" with no anonymous user. */
export function publicAccess(users: AuthUser[], roles: AuthRole[]): Message {
    const anonymous = users.find((user) => user.is_anonymous);
    if (!anonymous) return message("usersRoles.cards.publicOff");
    return accessSummary(anonymous, roles).short;
}

export function ruleCount(role: AuthRole): number {
    return role.grants.length + role.denies.length;
}

export function totals(users: AuthUser[], roles: AuthRole[]): Totals {
    return {
        users: users.length,
        localUsers: users.filter((user) => !user.is_super_user && !user.is_anonymous).length,
        roles: roles.length,
        usersWithRole: users.filter((user) => user.roles.length > 0).length,
        grants: roles.reduce((sum, role) => sum + role.grants.length, 0),
        denies: roles.reduce((sum, role) => sum + role.denies.length, 0)
    };
}

export function membersOf(role: string, users: AuthUser[]): AuthUser[] {
    return users.filter((user) => user.roles.includes(role));
}

export function rolesToAdd(user: AuthUser, roles: AuthRole[]): AuthRole[] {
    return roles
        .filter((role) => !user.roles.includes(role.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function usersToAdd(role: string, users: AuthUser[]): AuthUser[] {
    return users.filter((user) => !user.is_super_user && !user.roles.includes(role));
}

function userRank(user: AuthUser): number {
    if (user.is_super_user) return 0;
    if (user.is_anonymous) return 1;
    return 2;
}

export function sortUsers(users: AuthUser[]): AuthUser[] {
    return [...users].sort(
        (a, b) => userRank(a) - userRank(b) || a.username.localeCompare(b.username)
    );
}

export function filterUsers(users: AuthUser[], needle: string): AuthUser[] {
    const text = needle.trim().toLowerCase();
    if (text === "") return users;
    return users.filter(
        (user) =>
            user.username.toLowerCase().includes(text) ||
            user.roles.some((role) => role.toLowerCase().includes(text))
    );
}

export function filterRoles(roles: AuthRole[], needle: string): AuthRole[] {
    const text = needle.trim().toLowerCase();
    if (text === "") return roles;
    return roles.filter((role) => role.name.toLowerCase().includes(text));
}

export function initials(name: string): string {
    const parts = name.split(/[_\-. ]+/).filter((part) => part !== "");
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Read a rule as a target. A null value becomes an empty string. */
export function targetOf(rule: AuthRule): PrivilegeTarget {
    if (rule.target_type === "all") return { type: "all" };
    return { type: rule.target_type, value: rule.target_value ?? "" };
}

export function describeTarget(target: PrivilegeTarget): Message {
    if (target.type === "all") return message("usersRoles.target.all");
    if (target.type === "table") return message("usersRoles.target.table", { name: target.value });
    return message("usersRoles.target.path", { glob: target.value });
}
