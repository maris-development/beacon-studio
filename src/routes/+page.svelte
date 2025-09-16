<script lang="ts">

	import { beaconInstances, currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import ChooseBeaconModal from '@/components/modals/ChooseBeaconModal.svelte';
	import { onMount } from 'svelte';
	import Card from '@/components/card/card.svelte';
	import { BeaconClient } from '@/beacon-api/client';
  	import { base } from '$app/paths';
	import { Utils } from '@/utils';
	import Modal from '@/components/modals/Modal.svelte';
	import { Button } from '@/components/ui/button';

	let beaconInstanceArray: BeaconInstance[] = $beaconInstances;
	let currentBeaconInstanceValue: BeaconInstance | null = $currentBeaconInstance;
	let showChooseBeaconModal = $state(false);

	async function testConnection(){
		const client = BeaconClient.new(currentBeaconInstanceValue);
		await client.testConnection();
	}

	function updateInstanceValues() {
		currentBeaconInstanceValue = $currentBeaconInstance;
		beaconInstanceArray = $beaconInstances;
	}

	function openModalIfNoInstance() {
		pickFirstInstance();
		testConnection();

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
		createIhmInstanceIfNotExists();
		openModalIfNoInstance();
	});

	let showIhmStuff = false;
	// IHM Stuff:
	let showWelcomeModal = $state(showIhmStuff);

	function hideWelcomeModal() {
		showWelcomeModal = false;
	}

	function createIhmInstanceIfNotExists(){
		if(!showIhmStuff) return;

		updateInstanceValues();

		const ihm_beacon_url = 'https://beacon-ihm.maris.nl';

		// Check if an instance with the IHM Beacon URL already exists
		if(!beaconInstanceArray.find(i => i.url === ihm_beacon_url)) {
			const ihmInstance: BeaconInstance = {
				id: Utils.randomUUID(),
				name: 'IHM Beacon',
				url: ihm_beacon_url,
				description: 'De Informatiehuis Marien (IHM) Beacon server',
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			beaconInstances.update(instances => {
				instances.push(ihmInstance);
				return instances;
			});

			currentBeaconInstance.set(ihmInstance);
		}
	}
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
		<Card href="{base}/data-browser">
			<h2>Browse data</h2>
			<p>
				Browse the contents and definitions of your Beacon instance in a tabular interface.
			</p>
		</Card>

		<Card href="{base}/queries">
			<h2>Create queries</h2>
			<p>
				Use the query builder or query editor to create queries for your Beacon instance.
			</p>
		</Card>
		
		<Card href="{base}/visualisations">
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

{#if showWelcomeModal}
	 <Modal title="IHM Beacon Studio testomgeving" onClose={() => hideWelcomeModal()} width="50vw">

		<p>Welkom bij de Informatiehuis Marien Beacon Studio testomgeving! Dit is de eerste versie van de "Beacon Studio", ontwikkeld als proof of concept voor dataopslag, -toegang en visualisatie van IHM-data.</p>

		<p>
			Met deze tool kunt u verbinding maken met een Beacon-server, gegevens verkennen, aangepaste query’s uitvoeren en visualisaties genereren. 
			We moedigen u aan de mogelijkheden te ontdekken en feedback te delen over uw ervaring. 
			Deze omgeving is vooraf ingesteld om te verbinden met de IHM Beacon: 
			<a target="_blank" href="https://beacon-ihm.maris.nl/">https://beacon-ihm.maris.nl/</a>. Via deze link is ook de Beacon API beschikbaar.
		</p>

		<p>Voor technische documentatie over het gebruik van Beacon, <a target="_blank" href="https://maris-development.github.io/beacon/">klik hier</a>.</p>

		<p>Voor vragen, foutmeldingen of ondersteuning kunt u contact opnemen met Paul of Robin via &lt;voornaam&gt;@maris.nl.</p>

		<div slot="footer" class="footer-content">
			<Button onclick={hideWelcomeModal}>
				Doorgaan
			</Button>
		</div>
	</Modal>
{/if}


<style lang="scss">
	.beacon-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
