<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { resolve } from '$app/paths';
	import QueryWorkbench from '@/components/query-builder/QueryWorkbench.svelte';

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
	<QueryWorkbench />
</div>