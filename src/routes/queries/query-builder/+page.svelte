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
	<QueryWorkbench {initialQuery} />
</div>
