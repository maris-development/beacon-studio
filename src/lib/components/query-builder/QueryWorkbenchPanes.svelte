<!--
 QueryBuilderPanes — the Build-mode content of the workbench.

 Two collapsible panes side by side:
   left  = table selection + parameter selection (the existing builder)
   right = a live JSON view of the active block's query (Monaco, read-only)

 Both are driven by the active block in the QueryWorkspace:
   - builder edits -> onQueryChange -> workspace.updateActiveQuery (updates status,
     JSON and run-state)
   - switching blocks re-mounts the builder (keyed on activeBlockId) so it
     re-hydrates from that block's stored query (initialQuery).
-->
<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import QueryBuilder from './QueryBuilder.svelte';
	import QueryTextEditor from '@/components/query-editor/QueryTextEditor.svelte';
	import type { QueryDraft } from './QueryDraft';
	import { QueryWorkspace } from './QueryWorkspace.svelte';
	import type { QuerySelectionActions } from './QuerySelectionActions';
	import * as QueryFunctions from '@/components/query-builder/QueryFunctions';

	let { 
		workspace, 
		queryActions
	 }: { workspace: QueryWorkspace, queryActions: QuerySelectionActions } = $props();

	// Independent collapse state for each pane.
	let leftOpen = $state(true);
	let rightOpen = $state(true);

	// Live JSON of the active block's compiled query (read-only reflection).
	const activeQueryJson = $derived.by(() => {
		const query = QueryWorkspace.getQuery(workspace.activeBlock);

		if(query){
			return JSON.stringify(query, null, 2);
		}

		return '// No query yet. Pick a table and columns on the left.';
	});

	/** Builder edits flow into the active block's draft. */
	function handleDraftChange(draft: QueryDraft) {
		workspace.updateActiveDraft(draft);
	}
</script>

<div class="builder-pane">
	<!-- Left: builder -->
	<section class="pane" class:pane--collapsed={!leftOpen}>
		<header class="pane-header">
			<h2 class="pane-title">Query builder</h2>
			<Button
				variant="ghost"
				size="icon"
				title={leftOpen ? 'Collapse builder' : 'Expand builder'}
				onclick={() => (leftOpen = !leftOpen)}
			>
				{#if leftOpen}
					<ChevronLeft />
				{:else}
					<ChevronRight />
				{/if}
			</Button>
		</header>

		{#if leftOpen}
			<div class="pane-body">
				<!-- Re-mount per active block so the builder re-hydrates from its query. -->
				{#key workspace.activeBlockId}
					<QueryBuilder
						initialDraft={workspace.activeBlock?.draft ?? null}
						pendingSeed={QueryWorkspace.seedFor(workspace.activeBlock)}
						onDraftChange={handleDraftChange}
						workbenchActions={queryActions}
					/>
				{/key}
			</div>
		{/if}
	</section>

	<!-- Right: JSON editor -->
	<section class="pane right" class:pane--collapsed={!rightOpen}>
		
		<header class="pane-header">
			<h2 class="pane-title ">
				Query JSON
				<Button
					class="copy-json"
					variant="ghost"
					size="icon"
					title="Copy JSON to clipboard"
					onclick={() => QueryFunctions.copyJSON(queryActions.compileQuery)}
				>
					<CopyIcon />
				</Button>
			</h2>

			<Button
				variant="ghost"
				size="icon"
				title={rightOpen ? 'Collapse JSON' : 'Expand JSON'}
				onclick={() => (rightOpen = !rightOpen)}
			>
				{#if rightOpen}
					<ChevronRight />
				{:else}
					<ChevronLeft />
				{/if}
			</Button>
		</header>

		{#if rightOpen}
			<div class="pane-body">
				<QueryTextEditor sourceCode={activeQueryJson} height="100%" readOnly />
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.builder-pane {
		display: flex;
		gap: 1rem;

		@media (max-width: 1024px) {
			flex-direction: column;
			align-items: flex-start;

			> .pane:not(.pane--collapsed) {
				width: 100%;
			}
		}
	}

	.pane {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: white;
		border-radius: 0.75rem;
		border: 1px solid rgb(231, 231, 236);
		max-width: 100%;

	
		// A collapsed pane shrinks to just its header so the other pane expands.
		&.pane--collapsed {
			flex: 0 0 auto;

			.pane-header {
				border-bottom: none;
				flex-direction: column-reverse;

				.pane-title {
					writing-mode: sideways-lr;
    				text-orientation: mixed;
					white-space: nowrap;
					width: auto;           
				}
			}

			&.right {
				.pane-header {
					flex-direction: column-reverse;
					:global(.copy-json) {
						display: none;
					}
				}
			}
			
		}

		.pane-header {
			border-bottom: 1px solid var(--border);
			padding: 0.75rem;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;

			.pane-title {
				margin: 0;
				flex-grow: 1;
			}
		}

		&.right {
			.pane-header {
				flex-direction: row-reverse;

				h2 {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
			}
		}
		.pane-body {
			min-width: 0;
			height: 100%;
			padding: 0.75rem;
		}
	}
</style>
