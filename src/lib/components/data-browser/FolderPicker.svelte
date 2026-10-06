<!-- Picks a dataset folder. The list loads on first open. -->
<script lang="ts">
	import FolderIcon from '@lucide/svelte/icons/folder';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { allFolders } from '@/data-browser/folders';
	import { sqlErrorMessage } from '@/sql/statement';

	let {
		loadPaths,
		onPick
	}: { loadPaths: () => Promise<string[]>; onPick: (folder: string) => void } = $props();

	let open = $state(false);
	let folders: string[] | null = $state(null);
	let error = $state('');
	let needle = $state('');

	async function toggle() {
		open = !open;
		if (!open || folders) return;

		error = '';
		try {
			folders = allFolders(await loadPaths());
		} catch (caught) {
			error = sqlErrorMessage(caught);
		}
	}

	let matches = $derived.by(() => {
		if (!folders) return [];
		const query = needle.trim().toLowerCase();
		if (!query) return folders;
		return folders.filter((folder) => folder.toLowerCase().includes(query));
	});

	function pick(folder: string) {
		onPick(folder);
		open = false;
	}
</script>

<div class="folder-picker">
	<Button type="button" variant="outline" size="sm" onclick={toggle}>
		<FolderIcon />
		Pick folder
	</Button>

	{#if open}
		<div class="panel">
			{#if error}
				<p class="error">{error}</p>
			{:else if !folders}
				<p class="muted">Loading the folders...</p>
			{:else if folders.length === 0}
				<p class="muted">This node has no folders.</p>
			{:else}
				<Input type="search" placeholder="Filter folders" bind:value={needle} />
				<ul>
					{#each matches as folder (folder)}
						<li><button type="button" onclick={() => pick(folder)}>{folder}</button></li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.folder-picker {
		position: relative;
	}

	.panel {
		position: absolute;
		z-index: 10;
		top: 100%;
		right: 0;
		width: 22rem;
		max-height: 16rem;
		margin-top: 0.25rem;
		padding: 0.5rem;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--background);
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.1);
	}

	ul {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	li button {
		width: 100%;
		padding: 0.25rem;
		border: 0;
		background: none;
		text-align: left;
		cursor: pointer;
		word-break: break-all;

		&:hover {
			background: var(--accent);
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
