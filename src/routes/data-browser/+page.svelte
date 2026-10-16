<script lang="ts">
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { t } from '@/i18n';

	// Zero or unknown shows the plain section name.
	let datasetTotal = $state(0);
	let tableTotal = $state(0);

	let nodeUrl = $derived($currentNode?.url ?? null);

	let datasetsTitle = $derived.by(() => {
		if (datasetTotal > 0) return $t('dataBrowser.home.datasetCount', { count: datasetTotal });
		return $t('nav.item.datasets');
	});

	let dataTablesTitle = $derived.by(() => {
		if (tableTotal > 0) return $t('dataBrowser.home.tableCount', { count: tableTotal });
		return $t('nav.item.dataTables');
	});

	$effect(() => {
		if (!nodeUrl) return;
		untrack(() => count());
	});

	function count() {
		const node = $currentNode;
		if (!node) return;

		const client = makeBeaconClient(node);
		const url = node.url;
		datasetTotal = 0;
		tableTotal = 0;

		// A node switch during the request makes the answer stale.
		client.totalDatasets().then(
			(total) => {
				if (url === nodeUrl) datasetTotal = total;
			},
			() => {}
		);

		client.tables().then(
			(tables) => {
				if (url === nodeUrl) tableTotal = tables.length;
			},
			() => {}
		);
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('nav.item.dataBrowser') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('nav.item.dataBrowser'), href: resolve('/data-browser') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('nav.item.dataBrowser')}</h1>

		<p>{$t('dataBrowser.home.intro')}</p>

		<div class="data-browser-functions">
			<Card href={resolve('/data-browser/datasets')}>
				<h3>{datasetsTitle}</h3>
				<p>{$t('dataBrowser.home.datasetsCard')}</p>
			</Card>

			<Card href={resolve('/data-browser/data-tables')}>
				<h3>{dataTablesTitle}</h3>
				<p>{$t('dataBrowser.home.tablesCard')}</p>
			</Card>
		</div>
	</div>
</div>

<style lang="scss">
	.data-browser-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
