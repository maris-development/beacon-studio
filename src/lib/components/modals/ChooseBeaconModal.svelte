<!-- src/lib/components/ChooseBeaconModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { nodes, currentNode, selectNode, selectFirstIfNone } from '@/services/beacon-node';
	import Button from '$lib/components/buttons/Button.svelte';
	import AddBeaconModal from './AddBeaconModal.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SquareIcon from '@lucide/svelte/icons/square';
	import SquareCheckBigIcon from '@lucide/svelte/icons/square-check-big';
	import ExternalLink from '../ExternalLink.svelte';
	import Card from '../card/Card.svelte';
	import BeaconNodeStatus from '../BeaconNodeStatus.svelte';

	import { BeaconClient } from '@/beacon-api/client';
	import { checkAllNodes } from '@/services/beacon-node-connect';
	import { FRESH_MS } from '@/services/beacon-node-health';
	import { onMount } from 'svelte';

	export let onClose: () => void;

	// The picker shows the health of every node. Refresh the stale results.
	onMount(() => {
		void checkAllNodes(FRESH_MS);
	});

	let editingNode: BeaconNode | null = null;
	let showFormModal = false;

	// The picker must always show a selection when the list has one node.
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
		const node = $currentNode;
		if (!node) return;

		try {
			const client = BeaconClient.new(node);
			const tables = await client.getCachedTables();

			await Promise.all(tables.map((table) => client.getCachedSchema(table)));
		} catch (error) {
			console.warn('Could not prefetch the table schemas.', error);
		}
	}

	function pickNode(node: BeaconNode, e: Event | null = null) {
		if (e) e.stopPropagation(); // Prevent event bubbling if necessary

		selectNode(node.id);
	}

	function openBeaconFormModal(node: BeaconNode | null = null, e: Event | null = null) {
		if (e) e.stopPropagation(); // Prevent event bubbling if necessary

		editingNode = node;
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

<Modal title="Choose Beacon node" onClose={handleClose}>
	<p>Here are the currently configured Beacon nodes:</p>

	<div class="beacon-nodes-wrapper">
	<div class="beacon-nodes">
		{#if $nodes.length === 0}
			<Card>
				<p>No Beacon nodes configured. Please add one.</p>
            </Card>
		{/if}
		{#each $nodes as node (node.id)}

			<Card onclick={pickNode.bind(null, node)} class={$currentNode?.id === node.id ? 'border-2 border-primary' : ''}>
				<div class="node-heading">
					<h3>{node.name}</h3>
					<BeaconNodeStatus health={node} variant="compact" />
				</div>
				<p>URL: <ExternalLink href={node.url}>{node.url}</ExternalLink></p>
				{#if node.description && node.description.length > 0}
					<p>{node.description}</p>
				{/if}
				<p>Last update: {node.updatedAt}</p>
				<Button onclick={(e) => openBeaconFormModal(node, e)}>
					Edit
					<SquarePenIcon />
				</Button>
				<Button
					onclick={(e) => pickNode(node, e)}
					disabled={$currentNode?.id === node.id}>
					{#if $currentNode?.id === node.id}
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
			Add node
			<PlusIcon />
		</Button>

		<Button variant="outline" onclick={handleClose}>
			Done
			<CheckIcon />
		</Button>
	</div>
</Modal>

{#if showFormModal}
	<AddBeaconModal onSave={handleFormSave} onClose={handleFormClose} node={editingNode} />
{/if}

<style lang="scss">
	
	.beacon-nodes-wrapper {
		border-radius: 0.25rem;
		position: relative;
		margin-bottom: 1rem;
		overflow: hidden;
		height: 60vh;
	
		.beacon-nodes {
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

		.node-heading {
			display: flex;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;

			h3 {
				margin: 0;
			}
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
