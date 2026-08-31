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
	import type { QueryDraft } from '@/query/draft';
	import { QueryWorkspace } from './QueryWorkspace.svelte';
	import type { QueryActions } from './QueryActions';
	import * as QueryFunctions from '@/query/functions';

	let { 
		workspace, 
		queryActions
	 }: { workspace: QueryWorkspace, queryActions: QueryActions } = $props();

	// Independent collapse state for each pane.
	let leftOpen = $state(true);
	let rightOpen = $state(true);

	// Below this width the panes stack. Collapsing is off and both panes stay open.
	const NARROW_QUERY = '(max-width: 1024px)';
	let isNarrow = $state(false);

	$effect(() => {
		const narrowQuery = window.matchMedia(NARROW_QUERY);
		const onChange = (event: MediaQueryListEvent) => (isNarrow = event.matches);

		isNarrow = narrowQuery.matches;
		narrowQuery.addEventListener('change', onChange);

		return () => narrowQuery.removeEventListener('change', onChange);
	});

	// A pane is only collapsible on wide viewports.
	const showLeft = $derived(isNarrow || leftOpen);
	const showRight = $derived(isNarrow || rightOpen);

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

<div class="query-workbench-panes">
	<!-- Left: builder -->
	<section class="pane left" class:pane--collapsed={!showLeft}>
		<header class="pane-header">
			<h2 class="pane-title">Query builder</h2>
			{#if !isNarrow}
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
			{/if}
		</header>

		{#if showLeft}
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
	<section class="pane right" class:pane--collapsed={!showRight}>
		
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

			{#if !isNarrow}
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
			{/if}
		</header>

		{#if showRight}
			<div class="pane-body">
				<QueryTextEditor sourceCode={activeQueryJson} height="100%" readOnly />
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.query-workbench-panes {
		display: flex;
		gap: 1rem;
		align-items: stretch;

		@media (max-width: 1024px) {
			flex-direction: column;
			align-items: flex-start;

			> .pane {
				width: 100%;
			}
		}
	}

	.pane {
		flex-grow: 1;
		flex-shrink: 1;
		flex-basis: auto;
		width: 50%;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: white;
		border-radius: 0.75rem;
		border: 1px solid rgb(231, 231, 236);
		max-width: 100%;
		min-height: 100%;

	
		// A collapsed pane shrinks to just its header so the other pane expands.
		&.pane--collapsed {
			flex: 0 0 auto;
			width: auto;

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
			// height: 100%;
			flex: 1 1 auto;
			padding: 0.75rem;
		}
	}
</style>
