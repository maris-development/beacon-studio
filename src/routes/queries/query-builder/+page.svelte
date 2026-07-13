<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Card from '@/components/card/card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import AdvancedQueryBuilder from '@/components/query-builder/advanced-query-builder.svelte';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import { resolve } from '$app/paths';
	import EasyTableSelector from '@/components/query-builder/easy-table-selector.svelte';
	import NewQueryBuilderTableSelector from '@/components/query-builder/new-query-builder-table-selector.svelte';
	import QuerySelectionStatusBar from '@/components/query-buttons/QuerySelectionStatusBar.svelte';
	import { makeEmptyQuerySelectionStatus, type QuerySelectionStatus } from '@/components/query-builder/query-selection-status';
	import {type QuerySelectionActions} from '@/components/query-builder/query-selection-actions';

	const initialQuery: CompiledQuery | null = Utils.getUrlSuppliedQuery();
	const initialTab = initialQuery ? 'advanced-builder' : 'easy-builder';

	let activeTab = $state(initialTab);
	let querySelectionStatus = $state<QuerySelectionStatus>(makeEmptyQuerySelectionStatus());
	let querySelectionActions = $state<QuerySelectionActions | undefined>(undefined);
	let resetQueryBuilder = $state<(() => void) | undefined>(undefined);

	function handleSaveQuery() {
		console.log('Save query clicked');
	}

	function handleSavedQueries() {
		console.log('Saved queries clicked');
	}

	function handleReset() {
		resetQueryBuilder?.();
	}
</script>

<svelte:head>
	<title>Query builder - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Queries', href: resolve('/queries') },
		{ label: 'Query Builder', href: resolve('/queries/query-builder') }
	]}
/>


<div class="flex w-full flex-col gap-6 p-4">
	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="self-center">
			<Tabs.Trigger value="easy-builder">Easy Builder</Tabs.Trigger>
			<Tabs.Trigger value="advanced-builder">Advanced Builder</Tabs.Trigger>
			<Tabs.Trigger value="query-builder">Query Builder</Tabs.Trigger>
		</Tabs.List>

		<!-- This check can be removed later because this will become the only query builder -->
		{#if activeTab === 'query-builder'}
			<QuerySelectionStatusBar
				dataTable={querySelectionStatus.dataTable}
				columns={querySelectionStatus.columns}
				filters={querySelectionStatus.filters}
				selection={querySelectionStatus.selection}
				outputFormat={querySelectionStatus.outputFormat}
				saveQuery={handleSaveQuery}
				savedQueries={handleSavedQueries}
				reset={handleReset}
			/>
		{/if}

		<Tabs.Content value="easy-builder">
			<Card>
				<h1 class="title">Easy Query Builder</h1>
				<p class="description">
					Use this simple form to build your queries. It&apos;s great for quick tasks.
				</p>

				<EasyTableSelector />
			</Card>
		</Tabs.Content>
		<Tabs.Content value="advanced-builder">
			<Card>
				<h1 class="title">Advanced Query Builder</h1>
				<p class="description">Use this advanced form to build more complex queries.</p>

				<AdvancedQueryBuilder {initialQuery} />
			</Card>
		</Tabs.Content>
		<Tabs.Content value="query-builder">
			<Card>
				<h1 class="title">Query Builder</h1>
				<p class="description">Use this new form to build more queries.</p>

				<!-- Remove onReset from all subsequent scripts -->
				<NewQueryBuilderTableSelector bind:status={querySelectionStatus} bind:actions={querySelectionActions} bind:onReset={resetQueryBuilder} />
			</Card>
		</Tabs.Content>
	</Tabs.Root>
</div>
