import { beforeEach, describe, expect, it } from 'vitest';
import {
	TABS_STORAGE_KEY,
	addTab as addWith,
	closeTab as closeWith,
	emptyTabs as emptyWith,
	loadTabs as loadWith,
	openInNewTab as openWith,
	readTabs as readWith,
	renameTab,
	saveTabs,
	selectTab,
	setTabSql,
	type TabsState
} from '../tabs';

const titleOf = (number: number) => `Query ${number}`;
const emptyTabs = () => emptyWith(titleOf);
const loadTabs = () => loadWith(titleOf);
const readTabs = (raw: string | null) => readWith(raw, titleOf);
const addTab = (state: TabsState) => addWith(state, titleOf);
const closeTab = (state: TabsState, id: string) => closeWith(state, id, titleOf);
const openInNewTab = (state: TabsState, sql: string) => openWith(state, sql, titleOf);

describe('readTabs', () => {
	it('gives one empty tab for no value', () => {
		const state = readTabs(null);
		expect(state.tabs).toHaveLength(1);
		expect(state.tabs[0]).toMatchObject({ title: 'Query 1', sql: '' });
		expect(state.activeId).toBe(state.tabs[0].id);
	});

	it('gives one empty tab for bad JSON', () => {
		expect(readTabs('{oops').tabs).toHaveLength(1);
	});

	it('gives one empty tab for an empty list', () => {
		expect(readTabs(JSON.stringify({ tabs: [], activeId: 'x' })).tabs).toHaveLength(1);
	});

	it('drops entries of the wrong shape', () => {
		const raw = JSON.stringify({
			tabs: [{ id: 'a', title: 'A', sql: 'SELECT 1' }, { id: 5 }, null],
			activeId: 'a'
		});
		expect(readTabs(raw).tabs).toEqual([{ id: 'a', title: 'A', sql: 'SELECT 1' }]);
	});

	it('selects the first tab when activeId names no tab', () => {
		const raw = JSON.stringify({ tabs: [{ id: 'a', title: 'A', sql: '' }], activeId: 'gone' });
		expect(readTabs(raw).activeId).toBe('a');
	});
});

describe('tab changes', () => {
	it('adds a tab with the next free title and selects it', () => {
		const next = addTab(emptyTabs());
		expect(next.tabs.map((tab) => tab.title)).toEqual(['Query 1', 'Query 2']);
		expect(next.activeId).toBe(next.tabs[1].id);
	});

	it('names a new tab with the given title function', () => {
		const state = addWith(emptyWith((n) => `Vraag ${n}`), (n) => `Vraag ${n}`);
		expect(state.tabs.map((tab) => tab.title)).toEqual(['Vraag 1', 'Vraag 2']);
	});

	it('reuses a free title number', () => {
		let state = addTab(addTab(emptyTabs()));
		state = closeTab(state, state.tabs[1].id);
		expect(addTab(state).tabs.map((tab) => tab.title)).toEqual(['Query 1', 'Query 3', 'Query 2']);
	});

	it('selects the left neighbour after a close of the active tab', () => {
		let state = addTab(addTab(emptyTabs()));
		const [first, second, third] = state.tabs;
		state = selectTab(state, second.id);
		state = closeTab(state, second.id);
		expect(state.activeId).toBe(first.id);
		expect(state.tabs.map((tab) => tab.id)).toEqual([first.id, third.id]);
	});

	it('keeps the selection after a close of another tab', () => {
		let state = addTab(emptyTabs());
		const [first, second] = state.tabs;
		state = closeTab(state, first.id);
		expect(state.activeId).toBe(second.id);
	});

	it('leaves one new empty tab after a close of the last tab', () => {
		const state = emptyTabs();
		const next = closeTab(state, state.tabs[0].id);
		expect(next.tabs).toHaveLength(1);
		expect(next.tabs[0].id).not.toBe(state.tabs[0].id);
		expect(next.tabs[0].sql).toBe('');
	});

	it('renames, and keeps the old title for an empty name', () => {
		const state = emptyTabs();
		const id = state.tabs[0].id;
		expect(renameTab(state, id, ' Argo ').tabs[0].title).toBe('Argo');
		expect(renameTab(state, id, '  ').tabs[0].title).toBe('Query 1');
	});

	it('sets the SQL of one tab without a change to the input', () => {
		const state = emptyTabs();
		const next = setTabSql(state, state.tabs[0].id, 'SELECT 1');
		expect(next.tabs[0].sql).toBe('SELECT 1');
		expect(state.tabs[0].sql).toBe('');
	});

	it('ignores a select of an unknown tab', () => {
		const state = emptyTabs();
		expect(selectTab(state, 'nope').activeId).toBe(state.activeId);
	});
});

describe('storage', () => {
	beforeEach(() => localStorage.clear());

	it('saves and loads', () => {
		const state = setTabSql(emptyTabs(), emptyTabs().tabs[0].id, 'x');
		saveTabs(state);
		expect(JSON.parse(localStorage.getItem(TABS_STORAGE_KEY)!)).toEqual(state);
		expect(loadTabs()).toEqual(state);
	});
});

describe('openInNewTab', () => {
	it('adds a selected tab that holds the SQL', () => {
		const state = emptyTabs();
		const next = openInNewTab(state, 'SELECT 1');
		expect(next.tabs).toHaveLength(2);
		expect(next.tabs[1].sql).toBe('SELECT 1');
		expect(next.activeId).toBe(next.tabs[1].id);
	});

	it('opens a second tab for the same SQL', () => {
		const once = openInNewTab(emptyTabs(), 'SELECT 1');
		expect(openInNewTab(once, 'SELECT 1').tabs).toHaveLength(3);
	});
});
