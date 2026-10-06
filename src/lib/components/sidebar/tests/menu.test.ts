import { describe, expect, it } from 'vitest';
import { visibleGroups, type Group } from '../menu';

const groups: Group[] = [
	{
		title: 'Node Management',
		items: [
			{
				title: 'Data Browser',
				url: '/data-browser',
				icon: null,
				children: [
					{ title: 'Datasets', url: '/data-browser/datasets' },
					{ title: 'Storage', url: '/data-browser/storage', adminOnly: true }
				]
			},
			{ title: 'Crawlers', url: '/crawlers', icon: null, adminOnly: true }
		]
	},
	{
		title: 'Admin',
		items: [{ title: 'Users & Roles', url: '/access', icon: null, adminOnly: true }]
	}
];

describe('visibleGroups', () => {
	it('keeps every item with admin features on', () => {
		expect(visibleGroups(groups, true)).toEqual(groups);
	});

	it('hides admin items and empty groups with admin features off', () => {
		const result = visibleGroups(groups, false);

		expect(result).toHaveLength(1);
		expect(result[0].items.map((item) => item.title)).toEqual(['Data Browser']);
		expect(result[0].items[0].children?.map((child) => child.title)).toEqual(['Datasets']);
	});
});
