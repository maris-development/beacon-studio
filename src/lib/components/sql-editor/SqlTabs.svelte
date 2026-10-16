<!--
	The tab bar of the SQL editor. A double click on a title renames the tab.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { TabsState } from '@/sql/tabs';
	import { t } from '@/i18n';

	type Props = {
		state: TabsState;
		onSelect: (id: string) => void;
		onAdd: () => void;
		onClose: (id: string) => void;
		onRename: (id: string, title: string) => void;
	};

	let { state: tabsState, onSelect, onAdd, onClose, onRename }: Props = $props();

	let editingId = $state<string | null>(null);
	let draft = $state('');

	function startRename(id: string, title: string) {
		editingId = id;
		draft = title;
	}

	function commit() {
		if (editingId) onRename(editingId, draft);
		editingId = null;
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Enter') commit();
		if (event.key === 'Escape') editingId = null;
	}
</script>

<div class="tabs" role="tablist">
	{#each tabsState.tabs as tab (tab.id)}
		<div class="tab" class:active={tab.id === tabsState.activeId}>
			{#if editingId === tab.id}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="rename" bind:value={draft} onblur={commit} onkeydown={onKey} autofocus />
			{:else}
				<button
					type="button"
					role="tab"
					aria-selected={tab.id === tabsState.activeId}
					onclick={() => onSelect(tab.id)}
					ondblclick={() => startRename(tab.id, tab.title)}
				>
					{tab.title}
				</button>
			{/if}
			<button
				type="button"
				class="close"
				aria-label={$t('sqlEditor.tabs.close', { title: tab.title })}
				onclick={() => onClose(tab.id)}
			>
				<XIcon class="size-3" />
			</button>
		</div>
	{/each}

	<button type="button" class="add" aria-label={$t('sqlEditor.tabs.add')} onclick={onAdd}>
		<PlusIcon class="size-4" />
	</button>
</div>

<style lang="scss">
	.tabs {
		display: flex;
		align-items: flex-end;
		gap: 0.25rem;
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid transparent;
		border-bottom: 0;
		border-radius: 0.375rem 0.375rem 0 0;
		white-space: nowrap;

		&.active {
			border-color: var(--border);
			background: var(--background);
			font-weight: 600;
		}

		button {
			border: 0;
			background: none;
			color: inherit;
			cursor: pointer;
		}
	}

	.close {
		display: flex;
		opacity: 0.6;

		&:hover {
			opacity: 1;
		}
	}

	.rename {
		width: 8rem;
		font: inherit;
	}

	.add {
		display: flex;
		padding: 0.25rem;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
	}
</style>
