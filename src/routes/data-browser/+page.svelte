<script lang="ts">
	import { BeaconClient } from '@/beacon-api/client';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { onMount } from 'svelte';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import Card from '@/components/card/card.svelte';

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	let datasetsTitle: string = $state('Datasets');
	let dataTablesTitle: string = $state('Data Tables');

	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		countDatasets();
		countDataTables();
	});

	function countDatasets() {
		client
			.getTotalDatasets()
			.then((count) => {
				if (count > 0) {
					datasetsTitle = `${count} dataset${count > 1 ? 's' : ''}`;
				}
			})
			.catch((error) => {
				console.error('Error fetching dataset count:', error);
			});
	}

	async function countDataTables() {
		client
			.getTables()
			.then((tables) => {
				if (tables.length > 0) {
					dataTablesTitle = `${tables.length} data table${tables.length > 1 ? 's' : ''}`;
				}
			})
			.catch((error) => {
				console.error('Error fetching data tables:', error);
			});
	}
</script>

<svelte:head>
	<title>Data Browser - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Data Browser', href: '/data-browser' }]} />

<div class="page-container">
	<h1>Data Browser</h1>

	<p>Use the data browser functions listed below to explore and manage your Beacon contents.</p>

	<div class="data-browser-functions">
		<Card href="/data-browser/datasets">
			<h2>{datasetsTitle}</h2>
			<p>View and manage individual datasets.</p>
		</Card>

		<Card href="/data-browser/data-tables">
			<h2>{dataTablesTitle}</h2>
			<p>View and manage data tables.</p>
		</Card>
	</div>
</div>

<style lang="scss">
	.data-browser-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
