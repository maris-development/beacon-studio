<!-- src/lib/components/ChooseBeaconModal.svelte -->
<script lang="ts">
	import { beaconInstances, currentBeaconInstance } from '$lib/stores/config';
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '$lib/stores/config';
	import { Button } from '$lib/components/ui/button/index.js';
	import AddBeaconModal from './AddBeaconModal.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SquareIcon from '@lucide/svelte/icons/square';
	import SquareCheckBigIcon from '@lucide/svelte/icons/square-check-big';
	import { addToast } from '@/stores/toasts';
	import Card from '../card/card.svelte';

	export let onClose: () => void;

	let beaconInstanceArray = $beaconInstances;
	let currentBeaconInstanceValue: BeaconInstance | null = $currentBeaconInstance;
	let editingInstance: BeaconInstance | null = null;
	let showFormModal = false;

	if (currentBeaconInstanceValue == null && beaconInstanceArray.length > 0) {
		// If no current instance is set, set the first one
		pickInstance(beaconInstanceArray[0]);
	}

	/** Initialize form if editing */
	onMount(() => {
		return () => {
			//destructor
		};
	});

	function pickInstance(instance: BeaconInstance, e: Event | null = null) {
		if (e) e.stopPropagation(); // Prevent event bubbling if necessary

		currentBeaconInstanceValue = instance;

		currentBeaconInstance.set(instance);
	}

	function openBeaconFormModal(instance: BeaconInstance | null = null, e: Event | null = null) {
		if (e) e.stopPropagation(); // Prevent event bubbling if necessary

		editingInstance = instance;
		showFormModal = true;
	}

	function deleteInstance(instance: BeaconInstance) {
		if (!instance) return;

		console.log('Deleting Beacon instance:', instance);
		showFormModal = false;

		//update list of instances
		beaconInstanceArray = $beaconInstances;

		// Remove from array
		beaconInstanceArray = beaconInstanceArray.filter((i) => i.id !== instance.id);
		beaconInstances.set(beaconInstanceArray);

		// If the deleted instance was the current one, clear it or set to another
		if (currentBeaconInstanceValue?.id === instance.id) {
			if (beaconInstanceArray.length > 0) {
				pickInstance(beaconInstanceArray[0]);
			} else {
				currentBeaconInstanceValue = null;
				currentBeaconInstance.set(null);
			}
		}

		addToast({
			message: `The Beacon instance "${instance.name}" has been deleted.`,
			type: 'info'
		});
	}

	function handleFormSave(instance: BeaconInstance, isDeleted: boolean) {
		if (isDeleted) {
			deleteInstance(instance);
			return;
		}

		console.log('Saving Beacon instance:', instance);
		showFormModal = false;

		//update list of instances
		beaconInstanceArray = $beaconInstances;

		//find instance in beaconInstanceArray
		const existingIndex = beaconInstanceArray.findIndex((i) => i.id === instance.id);

		if (existingIndex !== -1) {
			// Update existing instance
			beaconInstanceArray[existingIndex] = instance;
		} else {
			// Add new instance
			beaconInstanceArray.push(instance);
		}

		beaconInstanceArray = [...beaconInstanceArray]; // trigger reactivity

		beaconInstances.set(beaconInstanceArray);

		if (beaconInstanceArray.length === 1) {
			pickInstance(instance);
		}
	}

	function handleFormClose() {
		showFormModal = false;
	}
</script>

<Modal title="Choose Beacon instance" {onClose}>
	<p>Here are the currently configured Beacon instances:</p>

	<div class="beacon-instances-wrapper">
	<div class="beacon-instances">
		{#if beaconInstanceArray.length === 0}
			<Card>
				<p>No Beacon instances configured. Please add one.</p>
            </Card>
		{/if}
		{#each beaconInstanceArray as instance}

			<Card onClick={pickInstance.bind(null, instance)} class={currentBeaconInstanceValue?.id === instance.id ? 'border-2 border-primary' : ''}>
				<h3>{instance.name}</h3>
				<p>URL: <a href={instance.url} target="_blank">{instance.url}</a></p>
				{#if instance.description && instance.description.length > 0}
					<p>{instance.description}</p>
				{/if}
				<p>Last update: {instance.updatedAt}</p>
				<Button onclick={(e) => openBeaconFormModal(instance, e)}>
					Edit
					<SquarePenIcon />
				</Button>
				<Button
					onclick={(e) => pickInstance(instance, e)}
					disabled={currentBeaconInstanceValue?.id === instance.id}>
					{#if currentBeaconInstanceValue?.id === instance.id}
						Selected
						<SquareCheckBigIcon />
					{:else}
						Select
						<SquareIcon />
					{/if}
				</Button>
			</Card>
		{/each}
	</div>
	</div>

	<div slot="footer" class="footer-content">
		<Button onclick={() => openBeaconFormModal(null)}>
			Add instance
			<PlusIcon />
		</Button>

		<Button variant="outline" onclick={onClose}>
			Done
			<CheckIcon />
		</Button>
	</div>
</Modal>

{#if showFormModal}
	<AddBeaconModal onSave={handleFormSave} onClose={handleFormClose} instance={editingInstance} />
{/if}

<style lang="scss">
	
	.beacon-instances-wrapper {
		border-radius: 0.25rem;
		position: relative;
		margin-bottom: 1rem;
		overflow: hidden;
		height: 60vh;
	
		.beacon-instances {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			display: flex;
			flex-direction: column;
			gap: 1rem;
			overflow-y: auto;
			padding: 0.5rem;
		
		}

		&::before {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			height: 0.5rem;
			pointer-events: none;
			background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, #0000 100%);
		}
		&::after {
			content: '';
			position: absolute;
			bottom: 0;
			left: 0;
			right: 0;
			height: 0.5rem;
			pointer-events: none;
			background: linear-gradient(to top, rgba(0,0,0,0.1) 0%, #0000 100%);
		}
	}
    
</style>
