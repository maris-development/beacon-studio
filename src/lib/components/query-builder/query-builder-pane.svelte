<!--
 QueryBuilderPane — the Build-mode content of the workbench.

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
	import { Button } from '$lib/components/ui/button/index.js';
	import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import PanelRightCloseIcon from '@lucide/svelte/icons/panel-right-close';
	import PanelRightOpenIcon from '@lucide/svelte/icons/panel-right-open';
	import NewQueryBuilderTableBlock from './new-query-builder-table-block.svelte';
	import QueryEditor from '@/components/query-editor/QueryEditor.svelte';
	import type { QueryWorkspace } from './query-workspace.svelte';
	import type { QueryDraft } from './query-draft';
	import {onMount} from 'svelte';

	let { workspace }: { workspace: QueryWorkspace } = $props();

	// Independent collapse state for each pane.
	let leftOpen = $state(true);
	let rightOpen = $state(true);

	// Live JSON of the active block's compiled query (read-only reflection).
	const activeQueryJson = $derived.by(() => {
		const query = workspace.queryFor(workspace.activeBlock);
		return query
			? JSON.stringify(query, null, 2)
			: '// No query yet — pick a table and columns on the left.';
	});

	// onMount(() => {
	// 	console.log('workspace.activeBlock?.draft', workspace.activeBlock?.draft);
	// });

	/** Builder edits flow into the active block's draft. */
	function handleDraftChange(draft: QueryDraft) {
		// console.log('handleDraftChange', draft);
		workspace.updateActiveDraft(draft);
	}
</script>

<div class="builder-pane">
	<!-- Left: builder -->
	<section class="pane" class:pane--collapsed={!leftOpen}>
		<header class="pane-header">
			<span class="pane-title">Query builder</span>
			<Button
				variant="ghost"
				size="icon"
				title={leftOpen ? 'Collapse builder' : 'Expand builder'}
				onclick={() => (leftOpen = !leftOpen)}
			>
				{#if leftOpen}<PanelLeftCloseIcon />{:else}<PanelLeftOpenIcon />{/if}
			</Button>
		</header>

		{#if leftOpen}
			<div class="pane-body">
				<!-- Re-mount per active block so the builder re-hydrates from its query. -->
				{#key workspace.activeBlockId}
					<NewQueryBuilderTableBlock
						initialDraft={workspace.activeBlock?.draft ?? null}
						pendingSeed={workspace.activeBlock?.pendingSeed ?? null}
						onDraftChange={handleDraftChange}
					/>
				{/key}
			</div>
		{/if}
	</section>

	<!-- Right: JSON editor -->
	<section class="pane" class:pane--collapsed={!rightOpen}>
		<header class="pane-header">
			<span class="pane-title">Query JSON</span>
			<Button
				variant="ghost"
				size="icon"
				title={rightOpen ? 'Collapse JSON' : 'Expand JSON'}
				onclick={() => (rightOpen = !rightOpen)}
			>
				{#if rightOpen}<PanelRightCloseIcon />{:else}<PanelRightOpenIcon />{/if}
			</Button>
		</header>

		{#if rightOpen}
			<div class="pane-body">
				<QueryEditor sourceCode={activeQueryJson} height="70vh" readOnly />
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.builder-pane {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.pane {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.75rem;
	}

	// A collapsed pane shrinks to just its header so the other pane expands.
	.pane--collapsed {
		flex: 0 0 auto;
	}

	.pane-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.pane-title {
		font-weight: 600;
	}

	.pane-body {
		min-width: 0;
	}
</style>
