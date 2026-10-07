<!--
	The picker of the global Beacon node, for pages that browse or manage one node.
	Query blocks keep their own node, so this picker does not change them.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '@/components/ui/label';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import { currentNode, nodes, selectNode } from '@/services/beacon-node';
	import { ensureFresh } from '@/services/beacon-node-connect';
	import { signedInNodeIds, signOut } from '@/services/admin-session';
	import { settings } from '@/stores/settings';

	let { actions }: { actions?: Snippet } = $props();

	// `ensureFresh` skips a check that is not due.
	$effect(() => {
		for (const node of $nodes) void ensureFresh(node);
	});

	let signedIn = $derived(
		$settings.adminFeatures && $currentNode !== null && $signedInNodeIds.has($currentNode.id)
	);
</script>

<div class="node-picker">
	<Label size="sm" for="beacon-node-select">Beacon Node</Label>

	<div class="picker-row">
		<Select.Root
			type="single"
			name="beaconNode"
			value={$currentNode?.id ?? ''}
			onValueChange={(id) => selectNode(id)}
		>
			<Select.Trigger id="beacon-node-select" class="node-select-trigger">
				{$currentNode?.name ?? 'Select a node'}
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Label>Nodes</Select.Label>
					{#each $nodes as node (node.id)}
						<Select.Item value={node.id} label={node.name}>
							{node.name}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>

		{#if $currentNode}
			<BeaconNodeStatus health={$currentNode} variant="dot" />
		{/if}

		{#if actions}
			<div class="actions">
				{@render actions()}
			</div>
		{/if}
	</div>

	{#if signedIn && $currentNode}
		<p class="session-line">
			Signed in ·
			<button type="button" class="sign-out" onclick={() => signOut($currentNode.id)}>
				Sign out
			</button>
		</p>
	{/if}
</div>

<style lang="scss">
	.node-picker {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 1rem;
	}

	.picker-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	.session-line {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--muted-foreground);
	}

	.sign-out {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
