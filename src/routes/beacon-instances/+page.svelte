<script lang="ts">
	import type { BeaconInstance } from '@/beacon-api/types';
	import { instances } from '@/services/beacon-instance';
	import { checkAllInstances } from '@/services/beacon-instance-connect';
	import { FRESH_MS } from '@/services/beacon-instance-health';
	import BeaconInstanceStatus from '@/components/BeaconInstanceStatus.svelte';
	import Button from '@/components/buttons/Button.svelte';
	// These two imports use the casing on disk. A different casing adds a
	// `svelte-check` error, and breaks a build on a case sensitive filesystem.
	import Card from '@/components/card/card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import AddBeaconModal from '@/components/modals/AddBeaconModal.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	let editingInstance: BeaconInstance | null = $state(null);
	let showFormModal = $state(false);

	// The table shows the health of every instance. Refresh the stale results.
	onMount(() => {
		void checkAllInstances(FRESH_MS);
	});

	// The newest instance first, so an addition lands at the top. `addInstance`
	// appends, so the reverse of the list is the order this page needs. A sort on
	// `createdAt` cannot do this: the import writes several records in one
	// millisecond, so their order would change on each start.
	let rows = $derived([...$instances].reverse());

	/** Opens the form. Pass `null` for an empty form. */
	function openForm(instance: BeaconInstance | null): void {
		editingInstance = instance;
		showFormModal = true;
	}

	/** The form writes to the service. This closes it and shows the new list. */
	function closeForm(): void {
		showFormModal = false;
	}
</script>

<svelte:head>
	<title>Beacon Instances - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Beacon Instances', href: resolve('/beacon-instances') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>Beacon Instances</h1>

		<p>Use this page to manage your connected Beacon instances.</p>

		<div class="actions">
			<Button onclick={() => openForm(null)}>
				Add instance
				<PlusIcon />
			</Button>
		</div>

		<Card class="beacon-instances">
			<div class="table-scroll">
				<table class="beacon-instances-table">
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
						{#each rows as instance (instance.id)}
							<tr>
								<td class="node-name">{instance.name}</td>
								<td class="node-description" title={instance.description}>
									<span class="clamp">{instance.description}</span>
								</td>
								<td class="node-url">
									<a href={instance.url} rel="noopener noreferrer" target="_blank">{instance.url}</a
									>
								</td>
								<td class="node-status">
									<BeaconInstanceStatus health={instance} variant="compact" />
								</td>
								<td class="node-actions">
									<Button variant="outline" onclick={() => openForm(instance)}>
										Edit
										<SquarePenIcon />
									</Button>
								</td>
							</tr>
						{:else}
							<tr>
								<td class="no-instances" colspan="5">No Beacon instances configured.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	</div>
</div>

{#if showFormModal}
	<AddBeaconModal onSave={closeForm} onClose={closeForm} instance={editingInstance} />
{/if}

<style lang="scss">
	.page-container {
		:global(.card.beacon-instances) {
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

	table.beacon-instances-table {
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

		.no-instances {
			color: var(--muted-foreground);
			text-align: center;
		}

		a {
			color: var(--primary);
		}
	}
</style>
