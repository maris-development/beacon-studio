<!-- Admin area of the system info page. It asks for a sign-in only from its button. -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LockIcon from '@lucide/svelte/icons/lock';
	import type { DatasetStorage } from '@maris-development/beacon-client';
	import type { BeaconNode } from '@/beacon-api/types';
	import AdminBadge from '@/components/AdminBadge.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import Meter from '@/components/system-info/Meter.svelte';
	import {
		askSignIn,
		credentialsOf,
		makeAdminClient,
		signedInNodeIds
	} from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { formatSize } from '@/data-browser/datasets';
	import { PERCENT_FORMAT } from '@/system-info/host';
	import { formatNumber, t } from '@/i18n';

	let { node }: { node: BeaconNode } = $props();

	type Counts = { crawlers: number | null; users: number | null; roles: number | null };

	let storage: DatasetStorage | null = $state(null);
	let counts: Counts | null = $state(null);

	let nodeId = $derived(node.id);
	let nodeUrl = $derived(node.url);
	let enabled = $derived($settings.adminFeatures);
	let active = $derived(enabled && $signedInNodeIds.has(nodeId));

	// A health check gives a new node object, so the effect tracks only the id, the URL and the session.
	$effect(() => {
		storage = null;
		counts = null;
		if (!active || !nodeUrl) return;

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
			admin.datasetStorage().catch(() => null),
			length(admin.listCrawlers<unknown[]>()),
			length(admin.listAuthUsers()),
			length(admin.listAuthRoles())
		]).then(([store, crawlers, users, roles]) => {
			if (!current) return;
			storage = store;
			counts = { crawlers, users, roles };
		});

		return () => (current = false);
	});

	function show(value: number | null | undefined): string {
		if (value === null || value === undefined) return '—';
		return $formatNumber(value);
	}

	function size(bytes: number | null): string {
		if (bytes === null) return '—';
		return formatSize(bytes, $formatNumber);
	}

	function percentText(value: number): string {
		return $formatNumber(value / 100, PERCENT_FORMAT);
	}
</script>

{#if enabled && !active}
	<div class="banner">
		<span class="text">
			<LockIcon size={14} />
			{$t('systemInfo.admin.signInNeeded')}
		</span>
		<Button variant="outline" size="sm" onclick={() => void askSignIn(node)}>
			<KeyRoundIcon />
			{$t('admin.sessionRequired.button')}
		</Button>
	</div>
{:else if active}
	<section class="card">
		<header>
			<HardDriveIcon size={16} />
			<h2>{$t('systemInfo.store.title')}</h2>
			<AdminBadge />
		</header>

		{#if storage}
			<div class="body">
				{#if storage.used_percent !== null}
					<Meter
						label={$t('systemInfo.store.usedFree', {
							used: size(storage.used_space),
							free: size(storage.free_space)
						})}
						percent={storage.used_percent}
						end={$t('systemInfo.store.percentOf', {
							percent: percentText(storage.used_percent),
							total: size(storage.total_space)
						})}
					/>
				{:else}
					<p class="muted">
						{$t('dataBrowser.datasets.storage.objects', {
							used: size(storage.used_space),
							count: storage.object_count ?? 0,
							location: storage.location
						})}
					</p>
				{/if}
				<dl>
					<dt>{$t('systemInfo.store.folder')}</dt>
					<dd>{storage.location}</dd>
					{#if storage.mount_point}
						<dt>{$t('systemInfo.store.mountPoint')}</dt>
						<dd>{storage.mount_point}</dd>
					{/if}
				</dl>
			</div>
		{/if}

		<footer>
			<a href={resolve('/data-browser/crawlers')}>
				{$t('nav.item.crawlers')} <strong>{show(counts?.crawlers)}</strong>
			</a>
			<span aria-hidden="true">·</span>
			<a href={resolve('/node-management/users-roles')}>
				{$t('systemInfo.admin.users')} <strong>{show(counts?.users)}</strong>
			</a>
			<span aria-hidden="true">·</span>
			<a href={resolve('/node-management/users-roles')}>
				{$t('systemInfo.admin.roles')} <strong>{show(counts?.roles)}</strong>
			</a>
		</footer>
	</section>
{/if}

<style lang="scss">
	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding: 0.5rem 0.75rem 0.5rem 1rem;
		border: 1px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card);

		.text {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			color: var(--muted-foreground);
			font-size: var(--font-size-sm);
		}
	}

	.card {
		border: 1px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card);

		header {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.75rem 1rem;
			border-bottom: 1px solid var(--card-border);

			h2 {
				margin: 0;
			}
		}

		.body {
			display: grid;
			gap: 0.75rem;
			padding: 0.75rem 1rem;
		}

		dl {
			display: grid;
			grid-template-columns: max-content 1fr;
			gap: 0.25rem 1rem;
			margin: 0;
			font-size: var(--font-size-sm);
		}

		dt {
			color: var(--muted-foreground);
		}

		dd {
			margin: 0;
			overflow-wrap: anywhere;
			font-family: var(--font-family-mono);
			font-size: var(--font-size-xs);
		}

		footer {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			border-top: 1px solid var(--card-border);
			color: var(--muted-foreground);
			font-size: var(--font-size-sm);

			a {
				color: inherit;
				text-decoration: none;

				&:hover {
					color: var(--foreground);
				}
			}

			strong {
				color: var(--foreground);
			}
		}
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}
</style>
