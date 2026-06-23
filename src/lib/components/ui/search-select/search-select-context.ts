import { getContext, setContext } from 'svelte';
import { writable, type Writable } from 'svelte/store';

type ItemMeta = {
	groupId: string | null;
	visible: boolean;
};

export type SearchSelectContext = {
	searchQuery: Writable<string>;
	selectedValue: Writable<string>;
	visibleItemCount: Writable<number>;
	visibleGroupCounts: Writable<Map<string, number>>;
	registerItem: (itemId: string, groupId: string | null) => void;
	unregisterItem: (itemId: string) => void;
	setItemVisible: (itemId: string, visible: boolean) => void;
	resetSearch: () => void;
};

const SEARCH_SELECT_CONTEXT = Symbol('search-select-context');
const SEARCH_SELECT_GROUP_CONTEXT = Symbol('search-select-group-context');

function normalizeSearch(value: string): string {
	return value.trim().toLowerCase();
}

function emitStoreUpdates(
	visibleItemCount: Writable<number>,
	visibleGroupCounts: Writable<Map<string, number>>,
	visibleCount: number,
	groupCounts: Map<string, number>
) {
	visibleItemCount.set(visibleCount);
	visibleGroupCounts.set(new Map(groupCounts));
}

export function createSearchSelectContext(): SearchSelectContext {
	const searchQuery = writable('');
	const selectedValue = writable('');
	const visibleItemCount = writable(0);
	const visibleGroupCounts = writable(new Map<string, number>());

	const items = new Map<string, ItemMeta>();
	const groupCounts = new Map<string, number>();
	let visibleCount = 0;

	function adjustGroupCount(groupId: string | null, delta: number) {
		if (!groupId) {
			return;
		}

		const nextValue = Math.max(0, (groupCounts.get(groupId) ?? 0) + delta);
		groupCounts.set(groupId, nextValue);
	}

	function registerItem(itemId: string, groupId: string | null) {
		if (items.has(itemId)) {
			return;
		}

		items.set(itemId, { groupId, visible: true });
		visibleCount += 1;
		adjustGroupCount(groupId, 1);
		emitStoreUpdates(visibleItemCount, visibleGroupCounts, visibleCount, groupCounts);
	}

	function unregisterItem(itemId: string) {
		const item = items.get(itemId);
		if (!item) {
			return;
		}

		if (item.visible) {
			visibleCount = Math.max(0, visibleCount - 1);
			adjustGroupCount(item.groupId, -1);
		}

		items.delete(itemId);
		emitStoreUpdates(visibleItemCount, visibleGroupCounts, visibleCount, groupCounts);
	}

	function setItemVisible(itemId: string, visible: boolean) {
		const item = items.get(itemId);
		if (!item || item.visible === visible) {
			return;
		}

		item.visible = visible;
		visibleCount += visible ? 1 : -1;
		visibleCount = Math.max(0, visibleCount);
		adjustGroupCount(item.groupId, visible ? 1 : -1);

		emitStoreUpdates(visibleItemCount, visibleGroupCounts, visibleCount, groupCounts);
	}

	function resetSearch() {
		searchQuery.set('');
	}

	return {
		searchQuery,
		selectedValue,
		visibleItemCount,
		visibleGroupCounts,
		registerItem,
		unregisterItem,
		setItemVisible,
		resetSearch
	};
}

export function setSearchSelectContext(context: SearchSelectContext) {
	setContext(SEARCH_SELECT_CONTEXT, context);
}

export function getSearchSelectContext(): SearchSelectContext {
	const context = getContext<SearchSelectContext | undefined>(SEARCH_SELECT_CONTEXT);
	if (!context) {
		throw new Error('SearchSelect components must be used inside SearchSelect.Root.');
	}
	return context;
}

export function setSearchSelectGroupContext(groupId: string) {
	setContext(SEARCH_SELECT_GROUP_CONTEXT, groupId);
}

export function getSearchSelectGroupContext(): string | null {
	return getContext<string | null>(SEARCH_SELECT_GROUP_CONTEXT) ?? null;
}

export function matchesSearch(value: string, query: string, keywords: string[] = []): boolean {
	const normalizedQuery = normalizeSearch(query);
	if (!normalizedQuery) {
		return true;
	}

	const haystack = normalizeSearch(`${value} ${keywords.join(' ')}`);
	const parts = normalizedQuery.split(/\s+/).filter(Boolean);

	for (const part of parts) {
		if (!haystack.includes(part)) {
			return false;
		}
	}

	return true;
}
