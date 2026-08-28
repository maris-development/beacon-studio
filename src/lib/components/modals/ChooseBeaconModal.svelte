<!-- src/lib/components/ChooseBeaconModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import type { BeaconInstance } from '@/beacon-api/types';
	import { instances, currentInstance, selectInstance, selectFirstIfNone } from '@/services/beacon-instance';
	import Button from '$lib/components/buttons/Button.svelte';
	import AddBeaconModal from './AddBeaconModal.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SquareIcon from '@lucide/svelte/icons/square';
	import SquareCheckBigIcon from '@lucide/svelte/icons/square-check-big';
	import ExternalLink from '../ExternalLink.svelte';
	import Card from '../card/Card.svelte';

	import { BeaconClient } from '@/beacon-api/client';

	export let onClose: () => void;

	let editingInstance: BeaconInstance | null = null;
	let showFormModal = false;

	// The picker must always show a selection when the list has one instance.
	selectFirstIfNone();

	/**
	 * Warms the schema cache of the selected node, then closes. The prefetch does
	 * not block the close: `getCachedSchema` stores the promise, so the cache is
	 * warm as soon as each request lands.
	 */
	function handleClose() {
		prefetchSchemas();
		onClose();
	}

	async function prefetchSchemas() {
		const instance = $currentInstance;
		if (!instance) return;

		try {
			const client = BeaconClient.new(instance);
			const tables = await client.getCachedTables();

			await Promise.all(tables.map((table) => client.getCachedSchema(table)));
		} catch (error) {
			console.warn('Could not prefetch the table schemas.', error);
		}
	}

	function pickInstance(instance: BeaconInstance, e: Event | null = null) {
		if (e) e.stopPropagation(); // Prevent event bubbling if necessary

		selectInstance(instance.id);
	}

	function openBeaconFormModal(instance: BeaconInstance | null = null, e: Event | null = null) {
		if (e) e.stopPropagation(); // Prevent event bubbling if necessary

		editingInstance = instance;
		showFormModal = true;
	}

	/** The form writes to the service. This closes it and shows the new list. */
	function handleFormSave() {
		showFormModal = false;
	}

	function handleFormClose() {
		showFormModal = false;
	}
</script>

<Modal title="Choose Beacon instance" onClose={handleClose}>
	<p>Here are the currently configured Beacon instances:</p>

	<div class="beacon-instances-wrapper">
	<div class="beacon-instances">
		{#if $instances.length === 0}
			<Card>
				<p>No Beacon instances configured. Please add one.</p>
            </Card>
		{/if}
		{#each $instances as instance (instance.id)}

			<Card onclick={pickInstance.bind(null, instance)} class={$currentInstance?.id === instance.id ? 'border-2 border-primary' : ''}>
				<h3>{instance.name}</h3>
				<p>URL: <ExternalLink href={instance.url}>{instance.url}</ExternalLink></p>
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
					disabled={$currentInstance?.id === instance.id}>
					{#if $currentInstance?.id === instance.id}
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

		<Button variant="outline" onclick={handleClose}>
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
