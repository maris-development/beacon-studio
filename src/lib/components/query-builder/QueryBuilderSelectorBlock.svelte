<!-- Query "blocks" selector row.

1 block per query, displaying table, columns, filters, rows and run state.
add new query blocks, duplicate blocks, close clocks, select active blocks
 -->

<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Card from '../card/card.svelte';
	import CirclePlusIcon from '@lucide/svelte/icons/circle-plus';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import XIcon from '@lucide/svelte/icons/x';
	import { addToast } from '@/stores/toasts';
	// import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import { QueryWorkspace } from './QueryWorkspace.svelte';
	import type { StoredQuery } from '@/stores/stored-query';

	// All state lives in the workspace; this component only reads/acts on it.
	let { 
		workspace,
		handleDoubleClick = null
		
	}: {
		workspace: QueryWorkspace 
		handleDoubleClick?: ((block: StoredQuery) => void) | null
	} = $props();

	const COLUMN_PREVIEW_LIMIT = 3;
	let editingBlockId: string | null = $state(null);
	let editingName = $state('');
	let isCommittingFromKeyboard: boolean = $state(false);

	function handleBlockKeydown(id: string, event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			workspace.selectBlock(id);
		}
	}

	function startRenameBlock(id: string, currentName: string): void {
		editingBlockId = id;
		editingName = currentName;
	}

	function cancelRenameBlock(): void {
		editingBlockId = null;
		editingName = '';
	}

	function commitRenameBlock(id: string): void {
		const trimmedName = editingName.trim();

		console.log('commitRenameBlock', editingName, trimmedName);

		if (!trimmedName) {
			addToast({ message: 'Query name cannot be empty.', type: 'warning' });
			return;
		}

		const didRename = workspace.renameBlock(id, trimmedName);
		if (!didRename) {
			addToast({ message: 'Could not rename query draft.', type: 'error' });
			return;
		}

		cancelRenameBlock();
	}

	function handleRenameInputKeydown(id: string, event: KeyboardEvent): void {
		event.stopPropagation();

		if (event.key === 'Enter') {
			event.preventDefault();
			isCommittingFromKeyboard = true;
			commitRenameBlock(id);
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			isCommittingFromKeyboard = true;
			cancelRenameBlock();
		}
	}

	// I think we could also just remove {editingName = '';} from the cancelRenameBlock()
	function handleRenameBlur(id: string) : void{
		if (isCommittingFromKeyboard) {
			isCommittingFromKeyboard = false;
			return;
		}

		commitRenameBlock(id);
	}

	function handleClick(block: StoredQuery){
		workspace.selectBlock(block.id);
	}

	function _handleDoubleClick(block: StoredQuery){
		if(handleDoubleClick){
			handleDoubleClick(block);
		}	
	}


</script>

<div class="query-blocks">
	<div class="query-blocks-row">
		{#each workspace.blocks as block (block.id)}
			<!-- Derive display data for this block from the workspace. -->
			{@const status = QueryWorkspace.getStatus(block)}
			{@const columns = QueryWorkspace.getSelectedColumns(block)}
			{@const run = workspace.getRunState(block)}
			<div
				
				class="query-block-wrapper"
				class:query-block-wrapper--active={block.id === workspace.activeBlockId}
				role="button"
				tabindex="0"
				aria-pressed={block.id === workspace.activeBlockId}
				onclick={() => handleClick(block)}
				ondblclick={() => _handleDoubleClick(block)}
				onkeydown={(event) => handleBlockKeydown(block.id, event)}
			>
				<Card class="query-block">
					<div class="query-block-header">
						<div class="query-block-name-wrapper">
							{#if editingBlockId === block.id}
								<input
									class="query-block-name-input"
									value={editingName}
									autofocus
									title="Edit query name"
									aria-label="Edit query name"
									oninput={(event) => (editingName = event.currentTarget.value)}
									onkeydown={(event) => handleRenameInputKeydown(block.id, event)}
									onblur={() => handleRenameBlur(block.id)}
									onclick={(event) => event.stopPropagation()}
								/>
							{:else}
								<span class="query-block-name" title={block.name}>
									{block.name}
								</span>
							{/if}
						</div>

						<div class="query-block-actions">
							<Button
								variant="ghost"
								size="icon"
								class="query-block-icon-button"
								title={editingBlockId === block.id ? 'Finish editing name' : 'Edit name'}
								aria-label={editingBlockId === block.id ? 'Finish editing name' : 'Edit name'}
								onclick={(event) => {
									event.stopPropagation();
									if (editingBlockId === block.id) {
										commitRenameBlock(block.id);
										return;
									}

									startRenameBlock(block.id, block.name);
								}}
							>
								{#if editingBlockId === block.id}
									<CircleCheckIcon />
								{:else}
									<PencilLineIcon />
								{/if}
							</Button>

							<Button
								variant="ghost"
								size="icon"
								class="query-block-icon-button"
								title="Duplicate query"
								aria-label="Duplicate query"
								onclick={(event) => {
									event.stopPropagation();
									workspace.duplicateBlock(block.id);
								}}
							>
								<CopyIcon />
							</Button>

							<Button
								variant="ghost"
								size="icon"
								class="query-block-icon-button"
								title="Close query"
								aria-label="Close query"
								disabled={workspace.blocks.length === 1}
								onclick={(event) => {
									event.stopPropagation();
									workspace.closeBlock(block.id);
								}}
							>
								<XIcon />
							</Button>
						</div>
					</div>

					<div class="query-block-body">
						<!-- <div class="query-block-line">
                            <span class="query-block-label">Table</span>
                            <span class="query-block-value" title={status.dataTable}>
                                {status.dataTable || 'No table'}
                            </span>
                        </div> -->

						<div class="query-stats">
							<span class="query-stat" title="Selected table">
								{status.dataTable || 'No table'}
							</span>
							<span class="query-stat" title="Amount of selected columns">
								{status.columns} columns
							</span>
							<span class="query-stat" title="Amount of applied filters">
								{status.filters}
								{status.filters == 1 ? 'filter' : 'filters'}
							</span>
							<span class="query-stat" title="Run status / amount of rows returned">
								{#if run.isRunning}
									Running...
								{:else if run.hasRun}
									{run.rows} {run.rows == 1 ? 'row' : 'rows'}
								{:else}
									Not cached
								{/if}
							</span>
						</div>

						<!-- <div class="query-block-line">
                            <span class="query-block-label">Columns</span>
                            <span class="query-block-value">{status.columns} selected</span>
                        </div> -->

						<div
							class="query-block-columns"
							title="Selected columns: {'\n\t' + columns.join(', \n\t')}"
						>
							{#if columns.length > 0}
								{#each columns.slice(0, COLUMN_PREVIEW_LIMIT) as column (column)}
									<Badge variant="secondary">{column}</Badge>
								{/each}
								{#if columns.length > COLUMN_PREVIEW_LIMIT}
									<Badge variant="outline">
										+{columns.length - COLUMN_PREVIEW_LIMIT}
									</Badge>
								{/if}
							{:else}
								<span class="query-block-muted">No columns selected</span>
							{/if}
						</div>

						<!-- <div class="query-block-line">
                            <span class="query-block-label">Rows</span>
                            <span class="query-block-value">{run.rows ?? 'N/A'}</span>
                        </div>

                        <div class="query-block-status">
                            {#if run.isRunning}
                                <CircleDashedIcon class="query-block-status-icon" />
                                <span>Running…</span>
                            {:else if run.hasRun}
                                <CircleCheckIcon class="query-block-status-icon query-block-status-icon--ok" />
                                <span>Query ran</span>
                            {:else}
                                <CircleDashedIcon class="query-block-status-icon" />
                                <span>Not run yet</span>
                            {/if}
                        </div> -->
					</div>
				</Card>
			</div>
		{/each}

		<button
			type="button"
			class="query-block-add"
			title="New query"
			aria-label="New query"
			onclick={() => workspace.addBlock()}
		>
			<CirclePlusIcon />
		</button>
	</div>
</div>

<style lang="scss">
	div.query-stats {
		display: flex;
		flex-direction: row;

		.query-stat {
			font-size: 0.75rem;
			color: var(--muted-foreground);
			text-wrap: nowrap;
			&:not(:last-child)::after {
				content: '•';
				margin-left: 0.5rem;
				margin-right: 0.5rem;
			}
		}
	}

	.query-blocks {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		.query-blocks-row {
			display: flex;
			align-items: stretch;
			gap: 0.75rem;
			overflow-x: auto;
			padding-bottom: 0.25rem;
		}
	}

	.query-block-wrapper {
		display: flex;
		flex: 0 0 15rem;
		cursor: pointer;

		:global(.query-block.card) {
			width: auto;
			gap: 0.5rem;
			padding: 0.75rem;
			transition:
				border-color 0.15s ease,
				box-shadow 0.15s ease;
		}

		&:hover {
			:global(.query-block.card) {
				border-color: var(--primary);
			}
		}

		&.query-block-wrapper--active {
			:global(.query-block.card) {
				border-color: var(--primary);
			}
		}
	}

	.query-blocks {
		.query-block-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			.query-block-name-wrapper {
				display: flex;
				align-items: center;
				flex: 1 1 auto;
				min-width: 0;
				overflow: hidden;
				max-width: 100%;

				span.query-block-name {
					display: block;
					font-weight: 600;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				input.query-block-name-input {
					box-sizing: border-box;
					width: 0;
					min-width: 0;
					max-width: 100%;
					flex-grow: 1;
					flex-shrink: 1;
					font: inherit;
					font-weight: 600;
					color: inherit;
					border: 1px solid var(--border);
					border-radius: 4px;
					background-color: var(--background);
					padding: 0; // .2rem 0.4rem;
				}
			}

			.query-block-actions {
				display: flex;
				align-items: center;
				gap: 0.25rem;
				flex-shrink: 0;
			}
		}

		.query-block-body {
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
			font-size: 0.8125rem;
		}

		// .query-block-line {
		//     display: flex;
		//     align-items: center;
		//     justify-content: space-between;
		//     gap: 0.5rem;
		// }

		// .query-block-label {
		//     color: var(--muted-foreground);
		// }

		// .query-block-value {
		//     font-weight: 500;
		//     overflow: hidden;
		//     text-overflow: ellipsis;
		//     white-space: nowrap;
		// }

		.query-block-columns {
			// display: flex;
			// flex-wrap: wrap;
			// gap: 0.25rem;
			// min-height: 1.5rem;
			visibility: hidden;
			height: 0;
		}

		.query-block-muted {
			color: var(--muted-foreground);
		}

		// .query-block-status {
		//     display: flex;
		//     align-items: center;
		//     gap: 0.375rem;
		//     color: var(--muted-foreground);
		// }

		.query-block-add {
			display: flex;
			align-items: center;
			justify-content: center;
			min-width: 3rem;
			border: 1px dashed var(--border);
			border-radius: var(--radius, 0.5rem);
			background: transparent;
			cursor: pointer;
			transition:
				border-color 0.15s ease,
				color 0.15s ease;

			&:hover {
				border-color: var(--primary);
				color: var(--primary);
			}
		}

		:global(.query-block-icon-button) {
			width: 1.75rem;
			height: 1.75rem;
		}

		:global(.query-block-status-icon) {
			width: 1rem;
			height: 1rem;
		}

		:global(.query-block-status-icon--ok) {
			color: var(--primary);
		}
	}
</style>
