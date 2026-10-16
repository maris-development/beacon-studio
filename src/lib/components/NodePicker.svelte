<!--
	The picker of the global Beacon node, for pages that browse or manage one node.
	Query blocks keep their own node, so this picker does not change them.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Label } from '@/components/ui/label';
	import AdminBadge from '@/components/AdminBadge.svelte';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import AddBeaconModal from '@/components/modals/AddBeaconModal.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { currentNode, nodes, selectNode } from '@/services/beacon-node';
	import { nodeHost } from '@/services/beacon-node-url';
	import { ensureFresh } from '@/services/beacon-node-connect';
	import { askSignIn, signedInNodeIds, signOut } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { t } from '@/i18n';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import LinkIcon from '@lucide/svelte/icons/link';

	let { actions }: { actions?: Snippet } = $props();

	let adding = $state(false);

	// `ensureFresh` skips a check that is not due.
	$effect(() => {
		for (const node of $nodes) void ensureFresh(node);
	});

	function isAdmin(id: string): boolean {
		return $settings.adminFeatures && $signedInNodeIds.has(id);
	}

	let currentIsAdmin = $derived($currentNode !== null && isAdmin($currentNode.id));

	function onAdded(node: BeaconNode | null) {
		adding = false;
		if (node) selectNode(node.id);
	}
</script>

<div class="node-picker">
	<Label size="sm" for="beacon-node-select">{$t('admin.nodePicker.label')}</Label>

	<div class="picker-row">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger id="beacon-node-select" class="node-trigger">
				{#if $currentNode}
					<BeaconNodeStatus health={$currentNode} variant="dot" />
					<span class="node-text">
						<span class="node-name">{$currentNode.name}</span>
						<span class="node-host">
							{#if $currentNode.latencyMs === null}
								{nodeHost($currentNode.url)}
							{:else}
								{$t('admin.nodePicker.hostLatency', {
									host: nodeHost($currentNode.url),
									latency: $currentNode.latencyMs
								})}
							{/if}
						</span>
					</span>
					{#if currentIsAdmin}
						<AdminBadge />
					{/if}
				{:else}
					<span class="node-text placeholder">{$t('admin.nodePicker.placeholder')}</span>
				{/if}
				<ChevronsUpDownIcon size={16} class="chevron" />
			</DropdownMenu.Trigger>

			<DropdownMenu.Content align="start" class="node-menu">
				<DropdownMenu.Group>
					<DropdownMenu.GroupHeading class="node-menu-heading">
						{$t('admin.nodePicker.group')}
					</DropdownMenu.GroupHeading>
					{#each $nodes as node (node.id)}
						<DropdownMenu.Item class="node-item" onSelect={() => selectNode(node.id)}>
							<BeaconNodeStatus health={node} variant="dot" />
							<span class="node-text">
								<span class="node-name">{node.name}</span>
								<span class="node-host">{nodeHost(node.url)}</span>
							</span>
							{#if isAdmin(node.id)}
								<AdminBadge />
							{/if}
							<span class="check">
								{#if node.id === $currentNode?.id}
									<CheckIcon />
								{/if}
							</span>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>

				<DropdownMenu.Separator />

				{#if $settings.adminFeatures && $currentNode}
					{@const current = $currentNode}
					{#if currentIsAdmin}
						<DropdownMenu.Item class="action-item" onSelect={() => signOut(current.id)}>
							<LogOutIcon />
							<span class="node-text">
								<span>{$t('admin.nodePicker.closeSession')}</span>
								<span class="node-host">{$t('admin.nodePicker.closeSessionHint')}</span>
							</span>
						</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item class="action-item" onSelect={() => void askSignIn(current)}>
							<KeyRoundIcon />
							<span class="node-text">
								<span>{$t('admin.nodePicker.signIn')}</span>
								<span class="node-host">
									{$t('admin.nodePicker.signInHint', { name: current.name })}
								</span>
							</span>
						</DropdownMenu.Item>
					{/if}
				{/if}

				<DropdownMenu.Item class="action-item" onSelect={() => (adding = true)}>
					<PlusIcon />
					{$t('admin.nodePicker.addNode')}
				</DropdownMenu.Item>
				<DropdownMenu.Item class="action-item" onSelect={() => goto(resolve('/beacon-nodes'))}>
					<LinkIcon />
					{$t('admin.nodePicker.manageNodes')}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		{#if actions}
			<div class="actions">
				{@render actions()}
			</div>
		{/if}
	</div>
</div>

<!-- A sibling of the menu: the menu closes on select, and a modal box is transformed. -->
{#if adding}
	<AddBeaconModal onSave={onAdded} onClose={() => (adding = false)} />
{/if}

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

	.picker-row :global(.node-trigger) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(26rem, 100%);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--background);
		text-align: left;
		cursor: pointer;

		&:focus-visible,
		&:global([data-state='open']) {
			border-color: var(--primary);
			outline: none;
		}

		:global(.chevron) {
			flex: 0 0 auto;
			color: var(--muted-foreground);
		}
	}

	.node-text {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-width: 0;

		&.placeholder {
			color: var(--muted-foreground);
		}
	}

	.node-name {
		font-weight: 600;
	}

	.node-name,
	.node-host {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-host {
		font-size: var(--font-size-sm);
		color: var(--muted-foreground);
	}

	// The menu renders in a portal, so these rules are global.
	:global(.node-menu) {
		min-width: var(--bits-menu-anchor-width);
		padding: 0.5rem;
	}

	:global(.node-menu-heading) {
		padding: 0.5rem 0.5rem 0.25rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	:global(.node-menu .node-item),
	:global(.node-menu .action-item) {
		gap: 0.75rem;
		padding: 0.5rem;
	}

	.check {
		display: inline-flex;
		flex: 0 0 auto;
		width: 1rem;
	}
</style>
