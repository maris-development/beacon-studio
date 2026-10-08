<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { resolve } from '$app/paths';
	import QueryWorkbench from '@/components/query-builder/QueryWorkbench.svelte';
	import { t } from '@/i18n';

</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('workbench.title') })}</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: $t('nav.item.queries'), href: resolve('/queries') },
		{ label: $t('workbench.title'), href: resolve('/queries/workbench') }
	]}
/>
<div class="page-wrapper">
	<QueryWorkbench />
</div>