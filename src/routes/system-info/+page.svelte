<script lang="ts">
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import InfoIcon from '@lucide/svelte/icons/info';
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ServerIcon from '@lucide/svelte/icons/server';
	import SquareFunctionIcon from '@lucide/svelte/icons/square-function';
	import TagIcon from '@lucide/svelte/icons/tag';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import Meter from '@/components/system-info/Meter.svelte';
	import StatTile from '@/components/system-info/StatTile.svelte';
	import AdminSummary from '@/components/system-info/AdminSummary.svelte';
	import { Input } from '@/components/ui/input';
	import { BRAND } from '@/brand';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { settings } from '@/stores/settings';
	import { parseFunctions, type FnMeta } from '@/sql/completion';
	import { sqlError } from '@/sql/statement';
	import { formatNumber, t, type Message } from '@/i18n';
	import {
		formatBytesOrDash,
		formatUptime,
		readInfo,
		type InfoView,
		type Usage
	} from '@/system-info/host';
	import { poll } from '@/system-info/poll';

	// A server setting, so it stays the same in every language.
	const SYS_INFO_FLAG = 'BEACON_ENABLE_SYS_INFO=true';

	let info: InfoView | null = $state(null);
	let raw: unknown = $state(null);
	let error: Message | null = $state(null);
	let functions: FnMeta[] | null = $state(null);
	let functionsError: Message | null = $state(null);
	let needle = $state('');
	// Live is on at each page load.
	let live = $state(true);
	let refreshing = $state(false);

	// Plain values: the effect writes them, and nothing renders them.
	let lastUrl: string | null = null;
	let readNow: (() => Promise<void>) | null = null;

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let period = $derived($settings.systemInfoUpdateIntervalMs);
	let host = $derived(info?.host ?? null);

	let matches = $derived.by(() => {
		if (!functions) return [];
		const query = needle.trim().toLowerCase();
		if (!query) return functions;
		return functions.filter((fn) => fn.name.toLowerCase().includes(query));
	});

	// A node change clears the page. A Live toggle or a period change keeps the last answer.
	$effect(() => {
		const url = nodeUrl;
		const every = period;
		const on = live;
		if (!url) {
			lastUrl = null;
			return;
		}

		const changed = url !== lastUrl;
		lastUrl = url;
		if (changed) {
			info = null;
			raw = null;
			error = null;
		}

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
				error = null;
			} catch (caught) {
				if (alive) error = sqlError(caught);
			}
		};
		readNow = read;

		let stop = () => {};
		if (on) {
			stop = poll(read, every);
		} else if (changed) {
			// Paused, but the page must not show the data of the previous node.
			void read();
		}

		return () => {
			alive = false;
			stop();
			readNow = null;
			// A hanging read of the previous node must not block Refresh on the next node.
			refreshing = false;
		};
	});

	// The function list loads once per node.
	$effect(() => {
		const url = nodeUrl;
		if (!url) return;

		functions = null;
		functionsError = null;

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
					if (alive) functionsError = sqlError(caught);
				}
			);

		return () => (alive = false);
	});

	async function refresh() {
		const read = readNow;
		if (!read || refreshing) return;

		refreshing = true;
		try {
			await read();
		} finally {
			refreshing = false;
		}
	}

	function size(bytes: number | null): string {
		return formatBytesOrDash(bytes, $formatNumber);
	}

	function usedText(value: Usage | null, key: 'systemInfo.memory.used' | 'systemInfo.memory.swap') {
		return $t(key, { size: size(value?.used ?? null) });
	}

	function ofText(value: Usage | null): string {
		if (!value) return '—';
		return $t('systemInfo.memory.of', { total: size(value.total) });
	}

	function uptimeText(secs: number | null): string {
		const uptime = formatUptime(secs);
		if (!uptime) return '—';
		return $t(uptime);
	}

	function kernelText(kernel: string | null | undefined): string | undefined {
		if (!kernel) return undefined;
		return $t('systemInfo.uptime.kernel', { kernel });
	}

	function coresText(count: number | undefined): string | undefined {
		if (!count) return undefined;
		return $t('systemInfo.cpu.cores', { count });
	}

	function loadText(value: number): string {
		return $formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('systemInfo.title') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('nav.item.systemInfo'), href: resolve('/system-info') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('systemInfo.title')}</h1>

		<p class="intro">{$t('systemInfo.intro')}</p>

		<div class="toolbar">
			<NodePicker />

			{#if node}
				<div class="actions">
					<BeaconNodeStatus health={node} variant="compact" />
					<Button
						variant="outline"
						size="sm"
						aria-pressed={live}
						title={live ? $t('systemInfo.liveStop') : $t('systemInfo.liveStart')}
						onclick={() => (live = !live)}
					>
						<TimerIcon />
						{#if live}
							{$t('systemInfo.live', { seconds: $formatNumber(period / 1000) })}
						{:else}
							{$t('systemInfo.paused')}
						{/if}
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label={$t('systemInfo.refresh')}
						title={$t('systemInfo.refresh')}
						disabled={refreshing}
						onclick={() => void refresh()}
					>
						<RefreshCwIcon class={refreshing ? 'spin' : ''} />
					</Button>
				</div>
			{/if}
		</div>

		{#if !node}
			<p>{$t('systemInfo.noNode')}</p>
		{:else}
			{#if error}
				<p class="error">{$t(error)}</p>
			{/if}

			<div class="tiles">
				<StatTile icon={TagIcon} label={$t('systemInfo.version')} value={info?.version ?? '—'} />
				<StatTile
					icon={ServerIcon}
					label={$t('systemInfo.host')}
					value={host?.hostName ?? '—'}
					detail={host?.osName ?? undefined}
				/>
				<StatTile
					icon={ClockIcon}
					label={$t('systemInfo.uptime.label')}
					value={uptimeText(host?.uptimeSecs ?? null)}
					detail={kernelText(host?.kernel)}
				/>
				<StatTile
					icon={CpuIcon}
					label={$t('systemInfo.cpu.title')}
					value={host?.cpuBrand ?? '—'}
					detail={coresText(host?.cores.length)}
				/>
			</div>

			<AdminSummary {node} />

			{#if info && !info.host}
				<p class="info-banner">
					<InfoIcon size={14} />
					<span>
						{$t('systemInfo.noHostBefore')}
						<code>{SYS_INFO_FLAG}</code>
						{$t('systemInfo.noHostAfter')}
					</span>
				</p>
			{/if}

			{#if host}
				<div class="panels">
					<section class="card">
						<header>
							<GaugeIcon size={16} />
							<h2>{$t('systemInfo.cpu.title')}</h2>
						</header>
						<div class="body">
							<Meter label={$t('systemInfo.cpu.total')} percent={host.cpuPercent} />
							<div class="cores">
								{#each host.cores as core, index (index)}
									<Meter label="#{core.name}" percent={core.percent} size="compact" />
								{/each}
							</div>
						</div>
					</section>

					<section class="card">
						<header>
							<MemoryStickIcon size={16} />
							<h2>{$t('systemInfo.memory.title')}</h2>
						</header>
						<div class="body">
							<div class="group">
								<Meter
									label={usedText(host.memory, 'systemInfo.memory.used')}
									percent={host.memory?.percent ?? null}
									end={ofText(host.memory)}
								/>
								<p class="muted">
									{#if host.freeMemory !== null}
										{$t('systemInfo.memory.availableFree', {
											available: size(host.availableMemory),
											free: size(host.freeMemory)
										})}
									{:else}
										{$t('systemInfo.memory.available', { size: size(host.availableMemory) })}
									{/if}
								</p>
							</div>

							{#if host.swap}
								<Meter
									label={usedText(host.swap, 'systemInfo.memory.swap')}
									percent={host.swap.percent}
									end={ofText(host.swap)}
								/>
							{:else}
								<p class="muted">{$t('systemInfo.memory.noSwap')}</p>
							{/if}

							{#if host.load}
								<dl class="load">
									<dt>{$t('systemInfo.load.one')}</dt>
									<dd>{loadText(host.load.one)}</dd>
									<dt>{$t('systemInfo.load.five')}</dt>
									<dd>{loadText(host.load.five)}</dd>
									<dt>{$t('systemInfo.load.fifteen')}</dt>
									<dd>{loadText(host.load.fifteen)}</dd>
								</dl>
							{/if}
						</div>
					</section>
				</div>
			{/if}

			<section class="card functions">
				<header>
					<SquareFunctionIcon size={16} />
					<h2>{$t('systemInfo.functions.title')}</h2>
					{#if functions}
						<span class="muted">
							{#if needle.trim()}
								{$t('systemInfo.functions.count', {
									shown: $formatNumber(matches.length),
									total: $formatNumber(functions.length)
								})}
							{:else}
								{$t('systemInfo.functions.total', { total: $formatNumber(functions.length) })}
							{/if}
						</span>
						<div class="search">
							<SearchIcon size={16} />
							<Input
								type="search"
								placeholder={$t('systemInfo.functions.filter')}
								bind:value={needle}
							/>
						</div>
					{/if}
				</header>

				<div class="body">
					{#if functionsError}
						<p class="error">{$t(functionsError)}</p>
					{:else if !functions}
						<p class="muted">{$t('systemInfo.functions.loading')}</p>
					{:else}
						<ul>
							{#each matches as fn (fn.name)}
								<li>
									<span class="name">{fn.name}</span>
									{#if fn.description}<span class="muted">{fn.description}</span>{/if}
								</li>
							{/each}
						</ul>
						<p class="note">
							{$t('systemInfo.functions.noteBefore')}
							{#if BRAND.links.docs}
								<a href={BRAND.links.docs} target="_blank" rel="noreferrer"
									>{$t('systemInfo.functions.noteLink')}</a
								>{:else}{$t('systemInfo.functions.noteLink')}{/if}{$t('systemInfo.functions.noteAfter')}
						</p>
					{/if}
				</div>
			</section>

			{#if raw}
				<details class="raw">
					<summary>{$t('systemInfo.raw')}</summary>
					<pre>{JSON.stringify(raw, null, 2)}</pre>
				</details>
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	.page-container {
		display: grid;
		// Without the minmax, the open raw answer widens the page past the screen.
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
	}

	h1,
	.intro {
		margin: 0;
	}

	.intro {
		margin-top: -0.75rem;
		color: var(--muted-foreground);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;

		:global(.spin) {
			animation: spin 1s linear infinite;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem;
	}

	.info-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.625rem 1rem;
		border-radius: 0.5rem;
		background: color-mix(in oklch, var(--primary) 8%, var(--card));
		font-size: var(--font-size-sm);

		:global(svg) {
			flex: 0 0 auto;
			color: var(--primary);
		}

		code {
			font-family: var(--font-family-mono);
			font-size: var(--font-size-xs);
		}
	}

	.panels {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr));
		gap: 1rem;
		align-items: start;
	}

	.card {
		min-width: 0;
		border: 1px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card);

		header {
			display: flex;
			flex-wrap: wrap;
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
			gap: 1rem;
			padding: 0.75rem 1rem;
		}

		p {
			margin: 0;
		}
	}

	.group {
		display: grid;
		gap: 0.375rem;
	}

	.cores {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.75rem 1rem;
	}

	.load {
		display: grid;
		grid-template-columns: max-content max-content;
		gap: 0.25rem 1rem;
		margin: 0;
		font-size: var(--font-size-sm);

		dt {
			color: var(--muted-foreground);
		}

		dd {
			margin: 0;
		}
	}

	.functions {
		.search {
			position: relative;
			width: 100%;
			max-width: 16rem;
			margin-left: auto;

			:global(svg) {
				position: absolute;
				top: 50%;
				left: 0.75rem;
				transform: translateY(-50%);
				color: var(--muted-foreground);
				pointer-events: none;
			}

			:global(input) {
				padding-left: 2.25rem;
			}
		}

		ul {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.75rem 2rem;
			max-height: 28rem;
			margin: 0;
			padding: 0;
			overflow: auto;
			list-style: none;

			@media (max-width: 48rem) {
				grid-template-columns: minmax(0, 1fr);
			}
		}

		li {
			display: grid;
			gap: 0.125rem;
			font-size: var(--font-size-xs);
			// Some descriptions hold a long URL.
			overflow-wrap: anywhere;
		}

		.note {
			color: var(--muted-foreground);
			font-size: var(--font-size-xs);

			a {
				color: inherit;
				text-decoration: underline;
			}
		}
	}

	.name {
		font-family: var(--font-family-mono);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.raw {
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
		margin: 0;
		color: var(--destructive);
	}
</style>
