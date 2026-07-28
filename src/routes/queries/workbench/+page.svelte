<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import { resolve } from '$app/paths';
	import QueryWorkbench from '@/components/query-builder/QueryWorkbench.svelte';

	const initialQuery: CompiledQuery | null = Utils.getUrlSuppliedQuery();
</script>

<svelte:head>
	<title>Query workbench - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Queries', href: resolve('/queries') },
		{ label: 'Query workbench', href: resolve('/queries/workbench') }
	]}
/>
<div class="page-wrapper">
	<QueryWorkbench {initialQuery} />
</div>