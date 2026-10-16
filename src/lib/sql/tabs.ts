export type SqlTab = { id: string; title: string; sql: string };

export type TabsState = { tabs: SqlTab[]; activeId: string };

/** The default title of tab number `number`. The page gives it in the current language. */
export type TabTitle = (number: number) => string;

export const TABS_STORAGE_KEY = 'beacon-studio.sql-tabs';

// Unique inside one browser is enough. `crypto.randomUUID` needs a secure context.
function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nextTitle(tabs: SqlTab[], titleOf: TabTitle): string {
	const titles = new Set(tabs.map((tab) => tab.title));
	let number = 1;

	while (titles.has(titleOf(number))) number += 1;

	return titleOf(number);
}

function newTab(tabs: SqlTab[], titleOf: TabTitle): SqlTab {
	return { id: newId(), title: nextTitle(tabs, titleOf), sql: '' };
}

export function emptyTabs(titleOf: TabTitle): TabsState {
	const tab = newTab([], titleOf);
	return { tabs: [tab], activeId: tab.id };
}

function isTab(value: unknown): value is SqlTab {
	if (!value || typeof value !== 'object') return false;

	const tab = value as Record<string, unknown>;
	return typeof tab.id === 'string' && typeof tab.title === 'string' && typeof tab.sql === 'string';
}

/** Reads a stored value with defaults. A bad value gives one empty tab. */
export function readTabs(raw: string | null, titleOf: TabTitle): TabsState {
	if (!raw) return emptyTabs(titleOf);

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return emptyTabs(titleOf);
	}

	const list = (parsed as { tabs?: unknown })?.tabs;
	if (!Array.isArray(list)) return emptyTabs(titleOf);

	const tabs = list.filter(isTab).map((tab) => ({ id: tab.id, title: tab.title, sql: tab.sql }));
	if (tabs.length === 0) return emptyTabs(titleOf);

	const activeId = (parsed as { activeId?: unknown }).activeId;
	if (typeof activeId === 'string' && tabs.some((tab) => tab.id === activeId)) {
		return { tabs, activeId };
	}

	return { tabs, activeId: tabs[0].id };
}

export function loadTabs(titleOf: TabTitle): TabsState {
	try {
		return readTabs(localStorage.getItem(TABS_STORAGE_KEY), titleOf);
	} catch {
		return emptyTabs(titleOf);
	}
}

export function saveTabs(state: TabsState): void {
	try {
		localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Blocked storage: the tabs live until the page closes.
	}
}

export function addTab(state: TabsState, titleOf: TabTitle): TabsState {
	const tab = newTab(state.tabs, titleOf);
	return { tabs: [...state.tabs, tab], activeId: tab.id };
}

export function closeTab(state: TabsState, id: string, titleOf: TabTitle): TabsState {
	const index = state.tabs.findIndex((tab) => tab.id === id);
	if (index === -1) return state;

	const tabs = state.tabs.filter((tab) => tab.id !== id);
	if (tabs.length === 0) return emptyTabs(titleOf);

	if (state.activeId !== id) return { tabs, activeId: state.activeId };

	return { tabs, activeId: tabs[Math.max(0, index - 1)].id };
}

export function selectTab(state: TabsState, id: string): TabsState {
	if (!state.tabs.some((tab) => tab.id === id)) return state;

	return { ...state, activeId: id };
}

export function renameTab(state: TabsState, id: string, title: string): TabsState {
	const trimmed = title.trim();
	if (trimmed === '') return state;

	return {
		...state,
		tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, title: trimmed } : tab))
	};
}

export function setTabSql(state: TabsState, id: string, sql: string): TabsState {
	return { ...state, tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, sql } : tab)) };
}

/** A new selected tab that holds `sql`. Another page opens SQL in the editor this way. */
export function openInNewTab(state: TabsState, sql: string, titleOf: TabTitle): TabsState {
	const added = addTab(state, titleOf);
	return setTabSql(added, added.activeId, sql);
}
