<!-- Admin extras for a node with a session. It never asks for a sign-in. -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { BeaconNode } from '@/beacon-api/types';
	import StorageBar from '@/components/data-browser/StorageBar.svelte';
	import StatTile from '@/components/system-info/StatTile.svelte';
	import { credentialsOf, makeAdminClient, signedInNodeIds } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { formatNumber, t } from '@/i18n';

	let { node }: { node: BeaconNode } = $props();

	type Counts = { crawlers: number | null; users: number | null; roles: number | null };

	let counts: Counts | null = $state(null);

	let nodeId = $derived(node.id);
	let active = $derived($settings.adminFeatures && $signedInNodeIds.has(nodeId));

	// A health check gives a new node object, so the effect tracks only the id and the session.
	$effect(() => {
		counts = null;
		if (!active) return;

		const credentials = credentialsOf(nodeId);
		if (!credentials) return;

		let current = true;
		const admin = makeAdminClient(
			untrack(() => node),
			credentials
		).admin;
		const length = (promise: Promise<unknown[]>) =>
			promise.then(
				(list) => list.length,
				() => null
			);

		Promise.all([
			length(admin.listCrawlers<unknown[]>()),
			length(admin.listAuthUsers()),
			length(admin.listAuthRoles())
		]).then(([crawlers, users, roles]) => {
			if (current) counts = { crawlers, users, roles };
		});

		return () => (current = false);
	});

	function show(value: number | null): string {
		if (value === null) return '—';
		return $formatNumber(value);
	}
</script>

{#if active}
	<section class="admin">
		<h2>{$t('systemInfo.admin.title')}</h2>
		<StorageBar {node} />
		{#if counts}
			<div class="tiles">
				<a href={resolve('/data-browser/crawlers')}>
					<StatTile label={$t('nav.item.crawlers')} value={show(counts.crawlers)} />
				</a>
				<StatTile label={$t('systemInfo.admin.users')} value={show(counts.users)} />
				<StatTile label={$t('systemInfo.admin.roles')} value={show(counts.roles)} />
			</div>
		{/if}
	</section>
{/if}

<style lang="scss">
	.admin {
		margin-top: 1.5rem;

		h2 {
			margin: 0 0 0.5rem;
		}
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.75rem;

		a {
			color: inherit;
			text-decoration: none;
		}
	}
</style>
