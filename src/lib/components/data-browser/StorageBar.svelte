<!-- Disk use of the datasets store. Only with a session: it never asks for a sign-in. -->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { DatasetStorage } from '@maris-development/beacon-client';
	import type { BeaconNode } from '@/beacon-api/types';
	import { credentialsOf, makeAdminClient, signedInNodeIds } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { formatSize } from '@/data-browser/datasets';
	import { formatNumber, t } from '@/i18n';

	let { node }: { node: BeaconNode } = $props();

	let storage: DatasetStorage | null = $state(null);

	let nodeId = $derived(node.id);
	let nodeUrl = $derived(node.url);
	let active = $derived($settings.adminFeatures && $signedInNodeIds.has(nodeId));

	// A health check gives a new node object, so the effect tracks only the id and the URL.
	$effect(() => {
		storage = null;
		if (!active || !nodeUrl) return;

		const credentials = credentialsOf(nodeId);
		if (!credentials) return;

		let current = true;
		makeAdminClient(
			untrack(() => node),
			credentials
		)
			.admin.datasetStorage()
			.then(
				(value) => {
					if (current) storage = value;
				},
				() => {
					if (current) storage = null;
				}
			);

		return () => (current = false);
	});
</script>

{#if storage}
	<div class="storage">
		{#if storage.used_percent !== null}
			<div class="bar"><span style="width: {storage.used_percent}%"></span></div>
			<span>
				{$t('dataBrowser.datasets.storage.usedOf', {
					used: formatSize(storage.used_space, $formatNumber),
					total: formatSize(storage.total_space, $formatNumber),
					free: formatSize(storage.free_space, $formatNumber)
				})}
			</span>
		{:else}
			<span>
				{$t('dataBrowser.datasets.storage.objects', {
					used: formatSize(storage.used_space, $formatNumber),
					count: storage.object_count ?? 0,
					location: storage.location
				})}
			</span>
		{/if}
	</div>
{/if}

<style lang="scss">
	.storage {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	.bar {
		width: 10rem;
		height: 0.5rem;
		overflow: hidden;
		border-radius: 0.25rem;
		background: var(--secondary);

		span {
			display: block;
			height: 100%;
			background: var(--primary);
		}
	}
</style>
