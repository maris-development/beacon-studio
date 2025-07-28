<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';

	import { beaconInstances, currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import ChooseBeaconModal from '@/components/modals/ChooseBeaconModal.svelte';
	import { onMount } from 'svelte';

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
</div>

{#if showChooseBeaconModal}
	<ChooseBeaconModal onClose={onModalClose} />
{/if}

<style lang="scss">
</style>
