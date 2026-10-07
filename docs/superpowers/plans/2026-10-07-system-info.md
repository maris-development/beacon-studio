# System Info (sub-project 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/system-info`: a node picker, all the data the node reports (version, health, host, CPU per core, memory, swap, load, functions), admin extras when signed in, and fixes for the CPU percentage, `NaN%` and the empty CPU list.

**Architecture:** A plain TypeScript module `src/lib/system-info/host.ts` reads the `info` answer safely and formats it (unit tested). Two small components (`Meter`, `StatTile`) render it. `AdminSummary` shows storage and counts from the admin API, only with an existing session, never with a sign-in prompt. The page uses the SDK through `makeBeaconClient`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, `@maris-development/beacon-client` 2.0.0, Vitest 3.

**Design:** approved in chat on 2026-10-07 (bounded change, no spec file). Summary in `docs/superpowers/admin-mode-roadmap.md`, sub-project 7 notes.
**Roadmap:** update row 7 when done.

## Facts (checked 2026-10-07)

- `/api/info` and `/admin/api/info` run the same handler (`beacon-server/src/axum/client/info.rs`). The answer is the same for every caller: `{ beacon_version, system_info }`.
- `system_info` is `null` unless the server runs with `BEACON_ENABLE_SYS_INFO`. On `beacon-wod.maris.nl` it is `null`, also for an admin.
- `system_info` is the serialized Rust `sysinfo::System`. `global_cpu_usage` and `cpus[].cpu_usage` are already percentages (0 to 100). `beacon-web` shows them as they are. The current Studio page multiplies by 100, which is wrong.
- Admin-only data that exists: `admin.datasetStorage()`, `admin.listCrawlers()`, `admin.listAuthUsers()`, `admin.listAuthRoles()`.

## Global Constraints

- Do not run `git commit` unless the user writes "commit". Never create a branch. No worktree.
- Edit files with the Edit or Write tool only. Never with `sed`, `perl` or `echo`.
- Tests go in `tests/` next to the code. Import with `../`.
- Prettier with tabs on new or rewritten files only. SCSS only. No new Tailwind classes.
- Comments: one short line, only for logic that is not clear. ASD-STE100.
- Prefer `if`/`else` over `?:` in script code. Markup expressions are exempt.
- Layer rule: `src/lib/system-info/*` imports only `src/lib/data-browser/*` (for `formatSize`) and its own files. No Svelte, `$app/*`, DOM, `services`, `stores`, `components`.
- Admin extras load only when `$settings.adminFeatures` is on and `$signedInNodeIds.has(node.id)`. They never call `withAdmin` and never open the sign-in dialog.
- Texts: no host data `This node does not report host data. The server runs without BEACON_ENABLE_SYS_INFO.` / missing value `—`.
- Telemetry: no new events.

## Review Focus

- A node with `system_info: null`: the page shows the version, health, functions and the "no host data" line, and no host cards. Test in Task 1, manual check in Task 4.
- A host answer with missing or odd fields (`cpus: []`, `total_swap: 0`, no `load_average`): no crash, `—` where a value is missing, no `NaN`. Tests in Task 1.
- A node switch while a request runs: the old answer does not show under the new node. Manual check in Task 4.
- Admin features on, no session: no admin request and no sign-in dialog. Manual check in Task 4.
- The refresh period setting changes: the timer restarts with the new period, and only `info` repeats. Manual check in Task 4.

---

### Task 1: Read and format the info answer

**Files:**
- Create: `src/lib/system-info/host.ts`
- Test: `src/lib/system-info/tests/host.test.ts`

**Interfaces:**
- Consumes: `formatSize` from `@/data-browser/datasets`.
- Produces:
  - `interface HostView { hostName: string | null; osName: string | null; kernel: string | null; uptimeSecs: number | null; cpuBrand: string | null; physicalCores: number | null; cpuPercent: number | null; cores: { name: string; percent: number }[]; memory: Usage | null; availableMemory: number | null; swap: Usage | null; load: { one: number; five: number; fifteen: number } | null }`
  - `interface Usage { used: number; total: number; percent: number }`
  - `interface InfoView { version: string | null; host: HostView | null }`
  - `readInfo(raw: unknown): InfoView`
  - `usage(used: unknown, total: unknown): Usage | null` (null when total is not a number above 0)
  - `clampPercent(value: number): number` (0 to 100)
  - `formatUptime(secs: number | null): string` (`3d 4h 12m`, `5h 0m`, `12m`, `—` for null)
  - `formatPercent(value: number | null): string` (`12.5%`, `—` for null)
  - `formatBytesOrDash(bytes: number | null): string` (`formatSize`, `—` for null)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/system-info/tests/host.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	clampPercent,
	formatBytesOrDash,
	formatPercent,
	formatUptime,
	readInfo,
	usage
} from '../host';

const host = {
	host_name: 'beacon-1',
	long_os_version: 'Linux 22.04 Ubuntu',
	kernel_version: '6.5.0',
	uptime: 273120,
	physical_core_count: 4,
	global_cpu_usage: 12.5,
	cpus: [
		{ name: 'cpu0', brand: 'AMD EPYC', cpu_usage: 20 },
		{ name: 'cpu1', brand: 'AMD EPYC', cpu_usage: 5 }
	],
	total_memory: 1000,
	used_memory: 250,
	available_memory: 700,
	total_swap: 200,
	used_swap: 50,
	load_average: { one: 0.5, five: 0.25, fifteen: 0.1 }
};

describe('readInfo', () => {
	it('reads a full answer', () => {
		const view = readInfo({ beacon_version: '2.0.0', system_info: host });
		expect(view.version).toBe('2.0.0');
		expect(view.host).toEqual({
			hostName: 'beacon-1',
			osName: 'Linux 22.04 Ubuntu',
			kernel: '6.5.0',
			uptimeSecs: 273120,
			cpuBrand: 'AMD EPYC',
			physicalCores: 4,
			cpuPercent: 12.5,
			cores: [
				{ name: 'cpu0', percent: 20 },
				{ name: 'cpu1', percent: 5 }
			],
			memory: { used: 250, total: 1000, percent: 25 },
			availableMemory: 700,
			swap: { used: 50, total: 200, percent: 25 },
			load: { one: 0.5, five: 0.25, fifteen: 0.1 }
		});
	});

	it('gives no host for system_info null', () => {
		expect(readInfo({ beacon_version: '2.0.0', system_info: null })).toEqual({
			version: '2.0.0',
			host: null
		});
	});

	it('does not multiply the CPU usage, and clamps it', () => {
		const view = readInfo({ system_info: { ...host, global_cpu_usage: 140 } });
		expect(view.host?.cpuPercent).toBe(100);
	});

	it('survives missing and odd fields', () => {
		const view = readInfo({ system_info: { cpus: [], total_swap: 0, used_swap: 0, load_average: 'x' } });
		expect(view.version).toBeNull();
		expect(view.host).toMatchObject({
			hostName: null,
			cpuBrand: null,
			cpuPercent: null,
			cores: [],
			memory: null,
			swap: null,
			load: null
		});
	});

	it('names a core with no name by its position', () => {
		const view = readInfo({ system_info: { cpus: [{ cpu_usage: 3 }] } });
		expect(view.host?.cores).toEqual([{ name: '#1', percent: 3 }]);
	});

	it('gives an empty view for a value of the wrong shape', () => {
		expect(readInfo('junk')).toEqual({ version: null, host: null });
	});
});

describe('formatting', () => {
	it('builds a usage only for a total above zero', () => {
		expect(usage(1, 4)).toEqual({ used: 1, total: 4, percent: 25 });
		expect(usage(0, 0)).toBeNull();
		expect(usage('a', 4)).toBeNull();
	});

	it('clamps a percentage', () => {
		expect(clampPercent(-3)).toBe(0);
		expect(clampPercent(250)).toBe(100);
	});

	it('writes the uptime', () => {
		expect(formatUptime(273120)).toBe('3d 3h 52m');
		expect(formatUptime(18000)).toBe('5h 0m');
		expect(formatUptime(720)).toBe('12m');
		expect(formatUptime(null)).toBe('—');
	});

	it('writes a percentage and bytes, with a dash for no value', () => {
		expect(formatPercent(12.54)).toBe('12.5%');
		expect(formatPercent(null)).toBe('—');
		expect(formatBytesOrDash(null)).toBe('—');
		expect(formatBytesOrDash(1536)).toBe('1.5 KB');
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/system-info`
Expected: FAIL with a missing-module error for `../host`.

- [ ] **Step 3: Write `host.ts`**

Create `src/lib/system-info/host.ts`:

```ts
import { formatSize } from '@/data-browser/datasets';

export interface Usage {
	used: number;
	total: number;
	percent: number;
}

export interface HostView {
	hostName: string | null;
	osName: string | null;
	kernel: string | null;
	uptimeSecs: number | null;
	cpuBrand: string | null;
	physicalCores: number | null;
	/** Already a percentage in the server answer. */
	cpuPercent: number | null;
	cores: { name: string; percent: number }[];
	memory: Usage | null;
	availableMemory: number | null;
	swap: Usage | null;
	load: { one: number; five: number; fifteen: number } | null;
}

export interface InfoView {
	version: string | null;
	host: HostView | null;
}

function text(value: unknown): string | null {
	if (typeof value === 'string' && value !== '') return value;
	return null;
}

function count(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return null;
}

export function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/** Null when the total is not above zero, so a missing swap shows no `NaN%`. */
export function usage(used: unknown, total: unknown): Usage | null {
	const usedValue = count(used);
	const totalValue = count(total);
	if (usedValue === null || totalValue === null || totalValue <= 0) return null;

	return { used: usedValue, total: totalValue, percent: clampPercent((usedValue / totalValue) * 100) };
}

function readLoad(value: unknown): HostView['load'] {
	if (!value || typeof value !== 'object') return null;

	const record = value as Record<string, unknown>;
	const one = count(record.one);
	const five = count(record.five);
	const fifteen = count(record.fifteen);
	if (one === null || five === null || fifteen === null) return null;

	return { one, five, fifteen };
}

function readHost(value: Record<string, unknown>): HostView {
	const cpus = Array.isArray(value.cpus) ? value.cpus : [];

	const cores = cpus
		.filter((cpu): cpu is Record<string, unknown> => cpu !== null && typeof cpu === 'object')
		.map((cpu, index) => ({
			name: text(cpu.name) ?? `#${index + 1}`,
			percent: clampPercent(count(cpu.cpu_usage) ?? 0)
		}));

	let cpuBrand: string | null = null;
	const first = cpus[0];
	if (first && typeof first === 'object') cpuBrand = text((first as Record<string, unknown>).brand);

	let cpuPercent: number | null = null;
	const global = count(value.global_cpu_usage);
	if (global !== null) cpuPercent = clampPercent(global);

	return {
		hostName: text(value.host_name),
		osName: text(value.long_os_version) ?? text(value.name),
		kernel: text(value.kernel_version),
		uptimeSecs: count(value.uptime),
		cpuBrand,
		physicalCores: count(value.physical_core_count),
		cpuPercent,
		cores,
		memory: usage(value.used_memory, value.total_memory),
		availableMemory: count(value.available_memory),
		swap: usage(value.used_swap, value.total_swap),
		load: readLoad(value.load_average)
	};
}

/** Reads `GET /api/info`. It never throws: a missing field gives `null`. */
export function readInfo(raw: unknown): InfoView {
	if (!raw || typeof raw !== 'object') return { version: null, host: null };

	const record = raw as Record<string, unknown>;
	let host: HostView | null = null;
	if (record.system_info && typeof record.system_info === 'object') {
		host = readHost(record.system_info as Record<string, unknown>);
	}

	return { version: text(record.beacon_version), host };
}

export function formatUptime(secs: number | null): string {
	if (secs === null) return '—';

	const days = Math.floor(secs / 86400);
	const hours = Math.floor((secs % 86400) / 3600);
	const minutes = Math.floor((secs % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatPercent(value: number | null): string {
	if (value === null) return '—';
	return `${value.toFixed(1)}%`;
}

export function formatBytesOrDash(bytes: number | null): string {
	if (bytes === null) return '—';
	return formatSize(bytes);
}
```

Note: `cpus.filter(...)` in `readHost` is fine; `Array.isArray(value.cpus) ? value.cpus : []` uses `?:`. Write it as `let cpus: unknown[] = []; if (Array.isArray(value.cpus)) cpus = value.cpus;`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/system-info`
Expected: PASS. Check `formatUptime(273120)`: 3 days = 259200, rest 13920 = 3h 52m. If the test value is wrong, fix the test value, not the function.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/system-info`, `npm run check`, `npx eslint src/lib/system-info`
Expected: no errors.

---

### Task 2: Meter, stat tile and admin summary

**Files:**
- Create: `src/lib/components/system-info/Meter.svelte`
- Create: `src/lib/components/system-info/StatTile.svelte`
- Create: `src/lib/components/system-info/AdminSummary.svelte`

**Interfaces:**
- Consumes: `formatPercent` (Task 1). `StorageBar` (`@/components/data-browser/StorageBar.svelte`). `credentialsOf`, `makeAdminClient`, `signedInNodeIds` (`@/services/admin-session`). `settings`.
- Produces:
  - `Meter` props `{ label: string; percent: number | null; detail?: string }`
  - `StatTile` props `{ label: string; value: string; detail?: string }`
  - `AdminSummary` props `{ node: BeaconNode }`. Renders nothing without admin features or a session.

- [ ] **Step 1: Create `Meter.svelte`**

```svelte
<script lang="ts">
	import { formatPercent } from '@/system-info/host';

	let { label, percent, detail }: { label: string; percent: number | null; detail?: string } =
		$props();
</script>

<div class="meter">
	<div class="head">
		<span>{label}</span>
		<span class="value">{detail ?? formatPercent(percent)}</span>
	</div>
	<div class="bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0}>
		<span style="width: {percent ?? 0}%"></span>
	</div>
</div>

<style lang="scss">
	.meter {
		display: grid;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.value {
		color: var(--muted-foreground);
	}

	.bar {
		height: 0.5rem;
		overflow: hidden;
		border-radius: 0.25rem;
		background: var(--secondary);

		span {
			display: block;
			height: 100%;
			background: var(--primary);
			transition: width 0.3s;
		}
	}
</style>
```

- [ ] **Step 2: Create `StatTile.svelte`**

```svelte
<script lang="ts">
	let { label, value, detail }: { label: string; value: string; detail?: string } = $props();
</script>

<div class="tile">
	<span class="label">{label}</span>
	<span class="value" title={value}>{value}</span>
	{#if detail}<span class="detail">{detail}</span>{/if}
</div>

<style lang="scss">
	.tile {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.label,
	.detail {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.value {
		overflow: hidden;
		font-size: 1.125rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
```

- [ ] **Step 3: Create `AdminSummary.svelte`**

```svelte
<!-- Admin extras for a node with a session. It never asks for a sign-in. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BeaconNode } from '@/beacon-api/types';
	import StorageBar from '@/components/data-browser/StorageBar.svelte';
	import StatTile from '@/components/system-info/StatTile.svelte';
	import { credentialsOf, makeAdminClient, signedInNodeIds } from '@/services/admin-session';
	import { settings } from '@/stores/settings';

	let { node }: { node: BeaconNode } = $props();

	type Counts = { crawlers: number | null; users: number | null; roles: number | null };

	let counts: Counts | null = $state(null);

	let nodeId = $derived(node.id);
	let active = $derived($settings.adminFeatures && $signedInNodeIds.has(nodeId));

	$effect(() => {
		counts = null;
		if (!active) return;

		const credentials = credentialsOf(nodeId);
		if (!credentials) return;

		let current = true;
		const admin = makeAdminClient(node, credentials).admin;
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
		return value.toLocaleString();
	}
</script>

{#if active}
	<section class="admin">
		<h2>Admin</h2>
		<StorageBar {node} />
		{#if counts}
			<div class="tiles">
				<a href={resolve('/data-browser/crawlers')}>
					<StatTile label="Crawlers" value={show(counts.crawlers)} />
				</a>
				<StatTile label="Users" value={show(counts.users)} />
				<StatTile label="Roles" value={show(counts.roles)} />
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
```

Notes for the implementer:
- The effect reads `node` inside `makeAdminClient(node, …)`. `node` changes object on each health check, which would repeat the three requests. Read it with `untrack(() => node)` inside the effect, so only `nodeId` and `active` trigger it.
- The `h2` keeps its global font styles; the rule sets only margin.

- [ ] **Step 4: Format and check**

Run: `npx prettier --write src/lib/components/system-info`, `npm run check`, `npx eslint src/lib/components/system-info`
Expected: no errors.

---

### Task 3: The page

**Files:**
- Modify (rewrite): `src/routes/system-info/+page.svelte`

**Interfaces:**
- Consumes: Tasks 1 and 2. `NodePicker`, `BeaconNodeStatus` (`variant="compact"`), `makeBeaconClient`, `currentNode`, `settings`, `parseFunctions` and `FnMeta` (`@/sql/completion`), `Input`.

- [ ] **Step 1: Rewrite the page**

```svelte
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
		type InfoView
	} from '@/system-info/host';

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

		void read();
		const timer = setInterval(read, every);

		return () => {
			alive = false;
			clearInterval(timer);
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
						detail={[info.host.osName, info.host.kernel].filter(Boolean).join(' · ') || undefined}
					/>
					<StatTile label="Uptime" value={formatUptime(info.host.uptimeSecs)} />
					<StatTile
						label="CPU"
						value={info.host.cpuBrand ?? '—'}
						detail={info.host.physicalCores === null ? undefined : `${info.host.physicalCores} physical cores`}
					/>
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
							{#each host.cores as core (core.name)}
								<Meter label={core.name} percent={core.percent} />
							{/each}
						</div>
					</section>

					<section>
						<h2>Memory</h2>
						<Meter
							label="Memory"
							percent={host.memory?.percent ?? null}
							detail={host.memory
								? `${formatBytesOrDash(host.memory.used)} of ${formatBytesOrDash(host.memory.total)}`
								: '—'}
						/>
						<p class="muted">Available: {formatBytesOrDash(host.availableMemory)}</p>
						{#if host.swap}
							<Meter
								label="Swap"
								percent={host.swap.percent}
								detail={`${formatBytesOrDash(host.swap.used)} of ${formatBytesOrDash(host.swap.total)}`}
							/>
						{:else}
							<p class="muted">No swap.</p>
						{/if}
					</section>

					{#if host.load}
						<section>
							<h2>Load average</h2>
							<p>1 min {host.load.one.toFixed(2)} · 5 min {host.load.five.toFixed(2)} · 15 min {host.load.fifteen.toFixed(2)}</p>
							{#if host.physicalCores}
								<p class="muted">Per core: {formatPercent((host.load.one / host.physicalCores) * 100)} over 1 min.</p>
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
							<li><span class="name">{fn.name}</span> <span class="muted">{fn.description ?? ''}</span></li>
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
			font-size: 0.8125rem;
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
			font-size: 0.875rem;
		}
	}

	.name {
		font-family: monospace;
	}

	.raw {
		margin-top: 1rem;

		pre {
			max-height: 24rem;
			padding: 0.75rem;
			overflow: auto;
			border-radius: 0.375rem;
			background: var(--secondary);
			font-size: 0.75rem;
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

Notes for the implementer:
- The `detail` expressions use `?:` and `||` inside markup. That is allowed. If one grows long, move it to a function in the script with `if`/`else`.
- `h2` keeps its global font styles; the rules set only margins.
- The page reads health from `node` (`BeaconNodeStatus`). `NodePicker` already calls `ensureFresh`, so the health stays current.
- `Utils.formatBytes` and `Utils.formatSecondsToReadableTime` are no longer used here. Do not remove them from `utils.ts`; other pages can use them.

- [ ] **Step 2: Check**

Run: `npm test`, `npm run check`, `npx eslint src/routes/system-info src/lib/system-info src/lib/components/system-info`, `npx prettier --write src/routes/system-info/+page.svelte`
Expected: no errors.

---

### Task 4: Docs, checks and manual test

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/admin-mode-roadmap.md`

- [ ] **Step 1: AGENTS.md**

Under "Domain modules", add:

```markdown
  - `src/lib/system-info/host.ts` (`readInfo`: a safe read of `GET /api/info`. `cpu_usage` is already a percentage. `system_info` is `null` unless the server runs with `BEACON_ENABLE_SYS_INFO`; the admin route returns the same data.)
```

- [ ] **Step 2: Roadmap**

Set row 7: plan link `[plan](plans/2026-10-07-system-info.md)` and the build status with the date and the results. In "Sub-project notes", replace the line for sub-project 7 with:

```markdown
- 7 System info (decided 2026-10-07): node picker; version, health, host data, CPU per core, memory, swap, load, functions, raw answer. Admin extras with a session only, no prompt: storage, and counts of crawlers, users and roles. The admin info route gives the same data as the public one; host data needs `BEACON_ENABLE_SYS_INFO` on the server, whoever asks. Rejected: a server change that gives host data to an admin with the flag off.
```

- [ ] **Step 3: Run every check**

Run: `npm test`, `npm run check`, `npx eslint src/lib/system-info src/lib/components/system-info src/routes/system-info`
Expected: all pass.

- [ ] **Step 4: Manual test**

Run `npm run dev`.

1. A node without host data (for example `beacon-wod.maris.nl`): version, health, the "does not report host data" line, functions with a filter, the raw answer. No host cards. No error.
2. A node with `BEACON_ENABLE_SYS_INFO` (a local node started with it): host, uptime, CPU meter and one meter per core, memory with available, swap or "No swap", load. The CPU percentage matches `top` on that host, not 100 times it.
3. Switch the node in the picker: all values change to the new node. Switch quickly twice: the last node wins.
4. Settings, "System info refresh": change it. The `info` request repeats at the new period (network tab). `functions` does not repeat.
5. Admin features off: no Admin section, no admin requests. On, no session: no Admin section and no sign-in dialog. Sign in on a data-browser page, come back: storage and the three counts show. "Crawlers" links to the Crawlers page.
6. Leave the page: the `info` requests stop.

Report each failed step to the user with what you saw.
