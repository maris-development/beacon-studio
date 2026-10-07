<script lang="ts">
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import Meter from '@/components/system-info/Meter.svelte';
	import StatTile from '@/components/system-info/StatTile.svelte';
	import AdminSummary from '@/components/system-info/AdminSummary.svelte';
	import { Input } from '@/components/ui/input';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { settings } from '@/stores/settings';
	import { parseFunctions, type FnMeta } from '@/sql/completion';
	import { sqlErrorMessage } from '@/sql/statement';
	import {
		formatBytesOrDash,
		formatPercent,
		formatUptime,
		readInfo,
		type HostView,
		type InfoView,
		type Usage
	} from '@/system-info/host';
	import { poll } from '@/system-info/poll';

	let info: InfoView | null = $state(null);
	let raw: unknown = $state(null);
	let error = $state('');
	let functions: FnMeta[] | null = $state(null);
	let functionsError = $state('');
	let needle = $state('');

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let period = $derived($settings.systemInfoUpdateIntervalMs);

	let matches = $derived.by(() => {
		if (!functions) return [];
		const query = needle.trim().toLowerCase();
		if (!query) return functions;
		return functions.filter((fn) => fn.name.toLowerCase().includes(query));
	});

	// The info repeats on the period from Settings. Only a node or period change restarts it.
	$effect(() => {
		const url = nodeUrl;
		const every = period;
		if (!url) return;

		info = null;
		raw = null;
		error = '';

		const current = untrack(() => node);
		if (!current) return;

		const client = makeBeaconClient(current);
		let alive = true;

		const read = async () => {
			try {
				const answer = await client.info<unknown>();
				if (!alive) return;
				raw = answer;
				info = readInfo(answer);
				error = '';
			} catch (caught) {
				if (alive) error = sqlErrorMessage(caught);
			}
		};

		const stop = poll(read, every);

		return () => {
			alive = false;
			stop();
		};
	});

	// The function list loads once per node.
	$effect(() => {
		const url = nodeUrl;
		if (!url) return;

		functions = null;
		functionsError = '';

		const current = untrack(() => node);
		if (!current) return;

		let alive = true;
		makeBeaconClient(current)
			.functions<unknown>()
			.then(
				(answer) => {
					if (alive) functions = parseFunctions(answer);
				},
				(caught) => {
					if (alive) functionsError = sqlErrorMessage(caught);
				}
			);

		return () => (alive = false);
	});

	function systemDetail(host: HostView): string | undefined {
		const parts = [host.osName, host.kernel].filter(Boolean);
		if (parts.length === 0) return undefined;
		return parts.join(' · ');
	}

	function coresDetail(host: HostView): string | undefined {
		if (host.physicalCores === null) return undefined;
		return `${host.physicalCores} physical cores`;
	}

	function usageDetail(value: Usage | null): string {
		if (!value) return '—';
		return `${formatBytesOrDash(value.used)} of ${formatBytesOrDash(value.total)}`;
	}
</script>

<svelte:head>
	<title>System Information - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'System Info', href: resolve('/system-info') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>System Information</h1>

		<p>The version, health and host resources of a Beacon node.</p>

		<NodePicker />

		{#if !node}
			<p>Pick a Beacon node.</p>
		{:else}
			{#if error}
				<p class="error">{error}</p>
			{/if}

			<div class="tiles">
				<StatTile label="Beacon version" value={info?.version ?? '—'} />
				<div class="health">
					<span class="label">Health</span>
					<BeaconNodeStatus health={node} variant="compact" />
				</div>
				{#if info?.host}
					<StatTile
						label="Host"
						value={info.host.hostName ?? '—'}
						detail={systemDetail(info.host)}
					/>
					<StatTile label="Uptime" value={formatUptime(info.host.uptimeSecs)} />
					<StatTile label="CPU" value={info.host.cpuBrand ?? '—'} detail={coresDetail(info.host)} />
				{/if}
			</div>

			{#if info && !info.host}
				<p class="muted">
					This node does not report host data. The server runs without BEACON_ENABLE_SYS_INFO.
				</p>
			{/if}

			{#if info?.host}
				{@const host = info.host}
				<div class="panels">
					<section>
						<h2>CPU</h2>
						<Meter label="Overall usage" percent={host.cpuPercent} />
						<div class="cores">
							{#each host.cores as core, index (index)}
								<Meter label={core.name} percent={core.percent} />
							{/each}
						</div>
					</section>

					<section>
						<h2>Memory</h2>
						<Meter
							label="Memory"
							percent={host.memory?.percent ?? null}
							detail={usageDetail(host.memory)}
						/>
						<p class="muted">Available: {formatBytesOrDash(host.availableMemory)}</p>
						{#if host.swap}
							<Meter label="Swap" percent={host.swap.percent} detail={usageDetail(host.swap)} />
						{:else}
							<p class="muted">No swap.</p>
						{/if}
					</section>

					{#if host.load}
						<section>
							<h2>Load average</h2>
							<p>
								1 min {host.load.one.toFixed(2)} · 5 min {host.load.five.toFixed(2)} · 15 min {host.load.fifteen.toFixed(
									2
								)}
							</p>
							{#if host.physicalCores}
								<p class="muted">
									Per core: {formatPercent((host.load.one / host.physicalCores) * 100)} over 1 min.
								</p>
							{/if}
						</section>
					{/if}
				</div>
			{/if}

			<AdminSummary {node} />

			<section class="functions">
				<h2>Functions</h2>
				{#if functionsError}
					<p class="error">{functionsError}</p>
				{:else if !functions}
					<p class="muted">Loading the functions...</p>
				{:else}
					<Input type="search" placeholder="Filter functions" bind:value={needle} />
					<p class="muted">{matches.length} of {functions.length} functions</p>
					<ul>
						{#each matches as fn (fn.name)}
							<li>
								<span class="name">{fn.name}</span>
								<span class="muted">{fn.description ?? ''}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if raw}
				<details class="raw">
					<summary>Raw answer</summary>
					<pre>{JSON.stringify(raw, null, 2)}</pre>
				</details>
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.health {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;

		.label {
			color: var(--muted-foreground);
			font-size: var(--font-size-sm);
		}
	}

	.panels {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1rem;

		section {
			display: grid;
			align-content: start;
			gap: 0.5rem;
			padding: 0.75rem;
			border: 1px solid var(--border);
			border-radius: 0.5rem;
		}

		h2 {
			margin: 0;
		}

		p {
			margin: 0;
		}
	}

	.cores {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.5rem;
	}

	.functions {
		margin-top: 1.5rem;

		ul {
			max-height: 24rem;
			margin: 0.5rem 0 0;
			padding: 0;
			overflow: auto;
			list-style: none;
		}

		li {
			padding: 0.25rem 0;
			border-bottom: 1px solid var(--border);
			font-size: var(--font-size-sm);
		}
	}

	.name {
		font-family: var(--font-family-mono);
	}

	.raw {
		margin-top: 1rem;

		pre {
			max-height: 24rem;
			padding: 0.75rem;
			overflow: auto;
			border-radius: 0.375rem;
			background: var(--secondary);
			font-size: var(--font-size-xs);
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
