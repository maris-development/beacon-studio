import type { MessageKey } from "@/i18n";

export type SubItem = { title: MessageKey; url: string; adminOnly?: boolean };

export type MenuItem = {
    title: MessageKey;
    url: string;
    /** Section roots the item highlights on. Defaults to `url`. */
    match?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    children?: SubItem[];
    target?: string;
    adminOnly?: boolean;
};

export type Group = {
    title: MessageKey;
    items: MenuItem[];
    /** The title opens and closes the group. The group starts closed. */
    collapsible?: boolean;
};

/** The menu without admin items while admin features are off. A group with no items goes too. */
export function visibleGroups(groups: Group[], adminFeatures: boolean): Group[] {
    if (adminFeatures) return groups;

    const result: Group[] = [];

    for (const group of groups) {
        const items = group.items
            .filter((item) => !item.adminOnly)
            .map((item) => {
                if (!item.children) return item;
                return { ...item, children: item.children.filter((child) => !child.adminOnly) };
            });

        if (items.length > 0) result.push({ ...group, items });
    }

    return result;
}

/** True on `url` and on every path below it. */
export function isPathActive(pathname: string, url: string): boolean {
    return pathname === url || pathname.startsWith(url + "/");
}

/** A parent with no `match` is active on its own URL and on its children only, not on a sibling page below it. */
export function isItemActive(
    pathname: string,
    item: { url: string; match?: string[]; children?: { url: string }[] }
): boolean {
    if (item.match) return item.match.some((root) => isPathActive(pathname, root));
    if (item.children) {
        return (
            pathname === item.url ||
            item.children.some((child) => isPathActive(pathname, child.url))
        );
    }

    return isPathActive(pathname, item.url);
}

/** True when the page of `pathname` is an item of the group. */
export function hasActiveItem(pathname: string, group: Group): boolean {
    return group.items.some((item) => isItemActive(pathname, item));
}

/** A group with no `collapsible` is always open. A collapsible group is closed until `openGroups` names it. */
export function isGroupOpen(group: Group, openGroups: Record<string, boolean>): boolean {
    if (!group.collapsible) return true;

    return openGroups[group.title] === true;
}

/** An admin item shows a lock while the current node has no admin session. */
export function isLocked(item: { adminOnly?: boolean }, hasSession: boolean): boolean {
    return !!item.adminOnly && !hasSession;
}
