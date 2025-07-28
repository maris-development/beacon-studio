<script lang="ts">
	import { BeaconClient } from "@/beacon-api/client";
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { onMount } from "svelte";
	import Cookiecrumb from "@/components/cookiecrumb/cookiecrumb.svelte";

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

		client.getTotalDatasets().then((count) => {
			if (count > 0) {
				datasetsTitle = `${count} dataset${count > 1 ? 's' : ''}`;
			}
		}).catch((error) => {
			console.error('Error fetching dataset count:', error);
		});
		
	}

	async function countDataTables() {
		client.getTables().then((tables) => {
			if (tables.length > 0) {
				dataTablesTitle = `${tables.length} data table${tables.length > 1 ? 's' : ''}`;
			}
		}).catch((error) => {
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

	<p>
		Use the data browser functions listed below to explore and manage your Beacon contents.
	</p>

    <div class="data-browser-functions">
		
		<a href="/data-browser/datasets" class="function">
			<h2>{datasetsTitle}</h2>
			<p>View and manage individual datasets.</p>
		</a>

		<a href="/data-browser/data-tables" class="function">
			<h2>{dataTablesTitle}</h2>
			<p>View and manage data tables.</p>
		</a>

		<!-- <a href="/data-browser/settings" class="function">
			<h2>Settings</h2>
			<p>Manage your data browser settings.</p>
		</a> -->

    </div>

</div>


<style lang="scss">

.data-browser-functions {
	display: flex;
	flex-direction: column;
	gap: 1rem;

	.function {
		padding: 1rem;
		border: 1px solid #DDD;
		border-radius: 4px;
		text-decoration: none;
		color: inherit;
		background: #eee;

		&:hover {
			filter: brightness(85%);
		}
	}
}

</style>