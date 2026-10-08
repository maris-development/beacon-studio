import type { MessageKey } from '@/i18n';

export type SubItem = { title: MessageKey; url: string; adminOnly?: boolean };

export type MenuItem = {
	title: MessageKey;
	url: string;
	/** Section root the item highlights on. Defaults to `url`. */
	match?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: any;
	children?: SubItem[];
	target?: string;
	adminOnly?: boolean;
};

export type Group = { title: MessageKey; items: MenuItem[] };

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
