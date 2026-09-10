<script lang="ts">
	import type { BeaconNode } from '@/beacon-api/types';
	import { nodes } from '@/services/beacon-node';
	import { checkAllNodes } from '@/services/beacon-node-connect';
	import { FRESH_MS } from '@/services/beacon-node-health';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import Card from '@/components/card/Card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AddBeaconModal from '@/components/modals/AddBeaconModal.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	let editingNode: BeaconNode | null = $state(null);
	let showFormModal = $state(false);

	// The table shows the health of every node. Refresh the stale results.
	onMount(() => {
		void checkAllNodes(FRESH_MS);
	});

	// The newest node first, so an addition lands at the top. `addNode`
	// appends, so the reverse of the list is the order this page needs. A sort on
	// `createdAt` cannot do this: the import writes several records in one
	// millisecond, so their order would change on each start.
	let rows = $derived([...$nodes].reverse());

	/** Opens the form. Pass `null` for an empty form. */
	function openForm(node: BeaconNode | null): void {
		editingNode = node;
		showFormModal = true;
	}

	/** The form writes to the service. This closes it and shows the new list. */
	function closeForm(): void {
		showFormModal = false;
	}
</script>

<svelte:head>
	<title>Beacon Nodes - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Beacon Nodes', href: resolve('/beacon-nodes') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>Beacon Nodes</h1>

		<p>
			Use this page to manage your connected Beacon nodes. Explore publicly available Beacon
			nodes at <a href="https://beacon-datalake.org/use-cases" rel="noopener noreferrer" target="_blank"
				>Beacon datalake</a
			>.
		</p>

		<div class="actions">
			<Button onclick={() => openForm(null)}>
				Add node
				<PlusIcon />
			</Button>
		</div>

		<Card class="beacon-nodes">
			<div class="table-scroll">
				<table class="beacon-nodes-table">
					<thead>
						<tr>
							<th>Node name</th>
							<th>Description</th>
							<th>URL</th>
							<th>Status</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as node (node.id)}
							<tr>
								<td class="node-name">{node.name}</td>
								<td class="node-description" title={node.description}>
									<span class="clamp">{node.description}</span>
								</td>
								<td class="node-url">
									<a href={node.url} rel="noopener noreferrer" target="_blank">{node.url}</a
									>
								</td>
								<td class="node-status">
									<BeaconNodeStatus health={node} variant="compact" />
								</td>
								<td class="node-actions">
									<Button variant="outline" onclick={() => openForm(node)}>
										Edit
										<SquarePenIcon />
									</Button>
								</td>
							</tr>
						{:else}
							<tr>
								<td class="no-nodes" colspan="5">No Beacon nodes configured.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	</div>
</div>

{#if showFormModal}
	<AddBeaconModal onSave={closeForm} onClose={closeForm} node={editingNode} />
{/if}

<style lang="scss">
	.page-container {
		:global(.card.beacon-nodes) {
			padding: 0;
			background-color: var(--background);
		}
	}

	.actions {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
		margin: 1rem 0;
	}

	// A narrow screen scrolls the table. The page itself must not scroll.
	.table-scroll {
		overflow-x: auto;
	}

	table.beacon-nodes-table {
		width: 100%;
		text-align: left;
		border-collapse: collapse;

		th,
		td {
			padding: 0.5rem 0.75rem;
			vertical-align: middle;
		}

		thead {
			background-color: var(--muted);
			color: var(--muted-foreground);
		}

		tbody {
			tr {
				&:nth-child(even) {
					background-color: var(--muted);
				}
			}
		}

		.node-name {
			font-weight: bold;
			white-space: nowrap;
		}

		// The description takes the room that the other columns leave. A max-width
		// on a cell does nothing here, because the auto table layout sizes a column
		// from its content.
		.node-description {
			width: 100%;
		}

		// The clamp needs a box of its own. A cell stretches to the height of the
		// row, so a clamp on the cell never cuts the text.
		.clamp {
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}

		// These columns hold one line each. They must not break a URL in two.
		.node-url,
		.node-status,
		.node-actions {
			white-space: nowrap;
		}

		.no-nodes {
			color: var(--muted-foreground);
			text-align: center;
		}

		a {
			color: var(--primary);
		}
	}
</style>
