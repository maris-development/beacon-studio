import { describe, expect, it } from 'vitest';
import { visibleGroups, type Group } from '../menu';

const groups: Group[] = [
	{
		title: 'nav.group.nodeManagement',
		items: [
			{
				title: 'nav.item.dataBrowser',
				url: '/data-browser',
				icon: null,
				children: [
					{ title: 'nav.item.datasets', url: '/data-browser/datasets' },
					{ title: 'nav.item.crawlers', url: '/data-browser/crawlers', adminOnly: true }
				]
			},
			{ title: 'nav.item.systemInfo', url: '/system-info', icon: null, adminOnly: true }
		]
	},
	{
		title: 'nav.group.studio',
		items: [{ title: 'nav.item.settings', url: '/settings', icon: null, adminOnly: true }]
	}
];

describe('visibleGroups', () => {
	it('keeps every item with admin features on', () => {
		expect(visibleGroups(groups, true)).toEqual(groups);
	});

	it('hides admin items and empty groups with admin features off', () => {
		const result = visibleGroups(groups, false);

		expect(result).toHaveLength(1);
		expect(result[0].items.map((item) => item.title)).toEqual(['nav.item.dataBrowser']);
		expect(result[0].items[0].children?.map((child) => child.title)).toEqual(['nav.item.datasets']);
	});
});
