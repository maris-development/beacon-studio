<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Card from '@/components/card/card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import AdvancedQueryBuilder from '@/components/query-builder/advanced-query-builder.svelte';
	import { resolve } from '$app/paths';
	import EasyTableSelector from '@/components/query-builder/easy-table-selector.svelte';
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
	<Tabs.Root value="easy-builder" class="w-full">
		<Tabs.List class="self-center">
			<Tabs.Trigger value="easy-builder">Easy Builder</Tabs.Trigger>
			<Tabs.Trigger value="advanced-builder">Advanced Builder</Tabs.Trigger>
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

				<AdvancedQueryBuilder />
			</Card>
		</Tabs.Content>
	</Tabs.Root>
</div>
