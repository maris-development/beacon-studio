<!--
	The first step of the query builder: the Beacon node.

	A query record owns its node, like it owns its table. Therefore this step
	comes before the table step. A switch of query block switches the node too.

	The component shows a value and reports a pick. It writes nothing. The parent
	calls `workspace.setActiveInstance`, which empties the draft.

	`missingUrl` is the URL of a node that the query names, but that the instance
	list does not hold. A share link gives this, and so does a node that the user
	removed. The component then offers to add that node.
-->
<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import GridIcon from '@lucide/svelte/icons/grid';
	import ListIcon from '@lucide/svelte/icons/list';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Select from '$lib/components/ui/select/index.js';
	import type { BeaconInstance } from '@/beacon-api/types';
	import { instances } from '@/services/beacon-instance';
	import { ensureFresh } from '@/services/beacon-instance-connect';
	import AddBeaconModal from '../modals/AddBeaconModal.svelte';
	import BeaconInstanceStatus from '../BeaconInstanceStatus.svelte';
	import Button from '../buttons/Button.svelte';
	import Card from '../card/Card.svelte';

	let {
		selected = null,
		missingUrl = null,
		onPick
	}: {
		/** The node of the query now, or null while it has none. */
		selected?: BeaconInstance | null;
		/** The URL of a node that the list does not hold, or null. */
		missingUrl?: string | null;
		/** Called with the node the user picked. */
		onPick: (instance: BeaconInstance) => void;
	} = $props();

	type ViewMode = 'cards' | 'list';

	let viewMode = $state<ViewMode>('cards');
	let viewModeInitialized = $state(false);
	let showAddModal = $state(false);

	// A short list fits in cards. A long list reads better as a dropdown. This
	// runs once, so a later pick of the user stays. See QueryBuilderTableSelector.
	$effect(() => {
		if (viewModeInitialized) return;

		viewMode = $instances.length < 10 ? 'cards' : 'list';
		viewModeInitialized = true;
	});

	// Show a true status on every card. `ensureFresh` skips a check that is not
	// due, so this costs nothing on a second visit.
	$effect(() => {
		for (const instance of $instances) void ensureFresh(instance);
	});

	// The dropdown binds a string, so it reports an id.
	let selectedId = $derived(selected?.id ?? '');

	function pickById(id: string): void {
		const instance = $instances.find((candidate) => candidate.id === id);
		if (instance) onPick(instance);
	}
</script>

{#if showAddModal}
	<AddBeaconModal
		presetUrl={missingUrl}
		onSave={() => (showAddModal = false)}
		onClose={() => (showAddModal = false)}
	/>
{/if}

<div class="instance-selector-header">
	<h3>Select Beacon Instance</h3>

	<div class="view-controls">
		<p class="instance-count">{$instances.length} instances</p>

		<Button variant={viewMode === 'cards' ? 'default' : 'outline'} onclick={() => (viewMode = 'cards')}>
			Cards
			<GridIcon />
		</Button>

		<Button variant={viewMode === 'list' ? 'default' : 'outline'} onclick={() => (viewMode = 'list')}>
			List
			<ListIcon />
		</Button>
	</div>
</div>

{#if missingUrl}
	<div class="missing-instance">
		<TriangleAlertIcon size="1rem" />
		<p>
			This query runs on <strong>{missingUrl}</strong>. The app has no instance for that
			address. Add it, or pick another instance below.
		</p>
		<Button onclick={() => (showAddModal = true)}>
			Add instance
			<PlusIcon />
		</Button>
	</div>
{/if}

<div class="instance-views">
	{#if viewMode === 'cards'}
		<div class="cards-view">
			{#each $instances as instance (instance.id)}
				<Card
					class={selected?.id === instance.id ? 'selected' : ''}
					onclick={() => onPick(instance)}
				>
					<div class="instance-header">
						<h4>{instance.name}</h4>
						{#if selected?.id === instance.id}
							<CircleCheck class="check" size="1rem" />
						{:else}
							<BeaconInstanceStatus health={instance} variant="dot" />
						{/if}
					</div>
					<p class="instance-url">{instance.url}</p>
				</Card>
			{/each}

			<Card class="add-card" onclick={() => (showAddModal = true)}>
				<div class="instance-header">
					<h4>Add instance</h4>
					<PlusIcon size="1rem" />
				</div>
				<p class="instance-url">Connect to another Beacon node.</p>
			</Card>
		</div>
	{:else}
		<Select.Root type="single" name="beaconInstance" value={selectedId} onValueChange={pickById}>
			<Select.Trigger class="instance-select-trigger">
				{selected?.name ?? 'Select an instance'}
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Label>Instances</Select.Label>
					{#each $instances as instance (instance.id)}
						<Select.Item value={instance.id} label={instance.name}>
							{instance.name}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	{/if}
</div>

<style lang="scss">
	.instance-selector-header {
		display: flex;
		align-items: center;
		justify-content: space-between;

		h3 {
			margin: 0;
		}

		.view-controls {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			p.instance-count {
				margin: 0;
			}
		}
	}

	.missing-instance {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-left: 3px solid IndianRed;
		background-color: var(--muted);

		p {
			margin: 0;
			flex-grow: 1;
			font-size: 0.875rem;
		}
	}

	.instance-views {
		margin-top: 1rem;

		.cards-view {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
			gap: 0.5rem;

			:global(.card) {
				padding: 0.6rem;
			}

			:global(.card.selected) {
				border-color: var(--primary);
				background-color: var(--selected-background);

				:global(.check) {
					color: var(--primary);
					align-self: flex-start;
				}
			}

			:global(.card.add-card) {
				border-style: dashed;
			}

			div.instance-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.5rem;

				h4 {
					margin: 0;
				}
			}

			p.instance-url {
				margin: 0;
				font-size: 0.875rem;
				color: hsl(0, 0%, 50%);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
		}

		:global(.instance-select-trigger) {
			width: 180px;
		}
	}
</style>
