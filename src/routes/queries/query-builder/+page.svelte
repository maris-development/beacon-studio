<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Card from '@/components/card/Card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AdvancedQueryBuilder from '@/components/query-builder/AdvancedQueryBuilder.svelte';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import { resolve } from '$app/paths';
	import EasyTableSelector from '@/components/query-builder/EasyTableSelector.svelte';
	import QueryWorkbench from '@/components/query-builder/QueryWorkbench.svelte';

	const initialQuery: CompiledQuery | null = Utils.getUrlSuppliedQuery();
	const initialTab = initialQuery ? 'advanced-builder' : 'easy-builder';

	let activeTab = $state(initialTab);
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
	<!-- <Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="self-center">
			<Tabs.Trigger value="easy-builder">Easy Builder</Tabs.Trigger>
			<Tabs.Trigger value="advanced-builder">Advanced Builder</Tabs.Trigger>
			<Tabs.Trigger value="query-builder">Query Builder</Tabs.Trigger>
		</Tabs.List>

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
			<QueryWorkbench {initialQuery} />
		</Tabs.Content>
	</Tabs.Root> -->

	<QueryWorkbench {initialQuery} />
</div>
