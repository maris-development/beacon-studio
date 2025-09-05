<script lang="ts">

	import { beaconInstances, currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import ChooseBeaconModal from '@/components/modals/ChooseBeaconModal.svelte';
	import { onMount } from 'svelte';
	import Card from '@/components/card/card.svelte';

	let beaconInstanceArray: BeaconInstance[] = $beaconInstances;
	let currentBeaconInstanceValue: BeaconInstance | null = $currentBeaconInstance;
	let showChooseBeaconModal = $state(false);

	function updateInstanceValues() {
		currentBeaconInstanceValue = $currentBeaconInstance;
		beaconInstanceArray = $beaconInstances;
	}

	function openModalIfNoInstance() {
		pickFirstInstance();

		if (currentBeaconInstanceValue == null) {
			showChooseBeaconModal = true;
		}
	}

	function pickFirstInstance() {
		updateInstanceValues();

		if (currentBeaconInstanceValue == null && beaconInstanceArray.length > 0) {
			// If no current instance is set, set the first one
			currentBeaconInstance.set(beaconInstanceArray[0]);
		}

		updateInstanceValues();
	}

	function onModalClose() {
		pickFirstInstance();

		if (currentBeaconInstanceValue != null) {
			showChooseBeaconModal = false;
			
		} else {
			alert('No Beacon instance selected. Please select one before proceeding.');

		}
	}

	onMount(() => {
		openModalIfNoInstance();
	});
</script>

<svelte:head>
	<title>Beacon Studio</title>
</svelte:head>

<Cookiecrumb />

<div class="page-container">
	<h1 class="">Welcome to Beacon Studio</h1>

	<p>
		Visit <a href="https://maris-development.github.io/beacon/">
			maris-development.github.io/beacon/
		</a> to read the documentation.
	</p>

	<div class="beacon-functions">
		<Card href="/data-browser">
			<h2>Browse data</h2>
			<p>
				Browse the contents and definitions of your Beacon instance in a tabular interface.
			</p>
		</Card>

		<Card href="/queries">
			<h2>Create queries</h2>
			<p>
				Use the query builder or query editor to create queries for your Beacon instance.
			</p>
		</Card>
		
		<Card href="/visualisations">
			<h2>Visualise data</h2>
			<p>
				Use the visualisation tools to view tables, charts and graphs of the contents of your Beacon instance.
			</p>
		</Card>


		
	</div>
</div>

{#if showChooseBeaconModal}
	<ChooseBeaconModal onClose={onModalClose} />
{/if}

<style lang="scss">
	.beacon-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
