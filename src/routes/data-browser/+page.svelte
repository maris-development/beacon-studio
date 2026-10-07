<script lang="ts">
	import { BeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import type { BeaconNode } from '@/beacon-api/types';
	import { onMount } from 'svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import { resolve } from '$app/paths';
	import { t } from '@/i18n';

	let currentNodeValue: BeaconNode | null = $state(null);
	let client: BeaconClient;

	let datasetCount: number = $state(0);
	let dataTableCount: number = $state(0);

	onMount(() => {
		currentNodeValue = $currentNode;
		client = BeaconClient.new(currentNodeValue);

		countDatasets();
		countDataTables();
	});

	function countDatasets() {
		client
			.getTotalDatasets()
			.then((count) => {
				datasetCount = count;
			})
			.catch((error) => {
				console.error('Error fetching dataset count:', error);
			});
	}

	async function countDataTables() {
		client
			.getTables()
			.then((tables) => {
				dataTableCount = tables.length;
			})
			.catch((error) => {
				console.error('Error fetching data tables:', error);
			});
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('nav.item.dataBrowser') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('nav.item.dataBrowser'), href: '/data-browser' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('nav.item.dataBrowser')}</h1>

		<p>{$t('browser.intro')}</p>

		<div class="data-browser-functions">
			<Card href={resolve('/data-browser/datasets')}>
				<h3>{datasetCount > 0 ? $t('browser.datasetCount', { count: datasetCount }) : $t('nav.item.datasets')}</h3>
				<p>{$t('browser.datasetsCard')}</p>
			</Card>

			<Card href={resolve('/data-browser/data-tables')}>
				<h3>{dataTableCount > 0 ? $t('browser.tableCount', { count: dataTableCount }) : $t('nav.item.dataTables')}</h3>
				<p>{$t('browser.tablesCard')}</p>
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
