<script lang="ts">
	import {
		addInstance,
		currentInstance,
		findByUrl,
		instances,
		normalizeUrl,
		selectInstance
	} from '@/services/beacon-instance';
	import { ensureFresh, ensureHostInstance } from '@/services/beacon-instance-connect';
	import { healthMap, healthOf } from '@/services/beacon-instance-health';
	import { openInstances, type OpenInstance } from '@/services/open-instances';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import BeaconInstanceStatus from '@/components/BeaconInstanceStatus.svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Card from '@/components/card/Card.svelte';
	import Button from '@/components/buttons/Button.svelte';

	import { asset, resolve } from '$app/paths';

	// The table shows the health of every public node. The layout loads the list.
	$effect(() => {
		for (const node of $openInstances) void ensureFresh(node);
	});

	// The Connected Instances card cycles through every configured instance, so
	// each one needs a true status dot. `ensureFresh` skips a check that is not due.
	$effect(() => {
		for (const instance of $instances) void ensureFresh(instance);
	});

	/** The normalized URL of the selection, or `null`. */
	let selectedUrl = $derived($currentInstance ? normalizeUrl($currentInstance.url) : null);

	// A plain `findByUrl` in the markup reads no store, so the button label would
	// not follow a change of the list. This set does.
	let configuredUrls = $derived(new Set($instances.map((instance) => normalizeUrl(instance.url))));

	const CYCLE_INTERVAL_MS = 5_000;

	/** Advances every `CYCLE_INTERVAL_MS`. The Connected Instances card uses it to
	 * step through `$instances`. */
	let cycleIndex = $state(0);

	/** The instance the Connected Instances card shows now, or `null` if none is configured. */
	let displayedInstance = $derived(
		$instances.length > 0 ? $instances[cycleIndex % $instances.length] : null
	);

	/**
	 * Adds the node and selects it. A node that the list already holds needs no
	 * second record, so the function selects that one instead.
	 */
	function connect(node: OpenInstance): void {
		const existing = findByUrl(node.url);

		if (existing) {
			selectInstance(existing.id);
			return;
		}

		const added = addInstance({
			name: node.name,
			url: node.url,
			description: node.description
		});

		selectInstance(added.id);
	}


	onMount(() => {
		// The app can run on the same host as a Beacon node. Add that node once.
		void ensureHostInstance(window.location.origin);

		const timer = setInterval(() => (cycleIndex += 1), CYCLE_INTERVAL_MS);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Beacon Studio</title>
</svelte:head>

<Cookiecrumb />

<div class="page-wrapper">
	<div class="header">
		<h1 class="title">Welcome to Beacon <span class="highlight">Studio</span></h1>
		<p class="subtitle">Explore and analyse your Beacon node data</p>
	</div>

	<h2>Connected Instances ({$instances.length})</h2>

	<div class="connected-instances">
		<Card>
			<div class="current-node">
				{#key displayedInstance?.id ?? 'none'}
					<div class="cycle-content" transition:fade={{ duration: 500 }}>
						{#if displayedInstance}
							<div class="current-node-info">
								<div class="name-url">
									<p class="name">{displayedInstance.name}</p>
									<a class="url" href={displayedInstance.url} rel="noopener noreferrer" target="_blank"
										>{displayedInstance.url}</a
									>
								</div>
								<BeaconInstanceStatus health={displayedInstance} />
							</div>
						{:else}
							<p class="no-instance">No Beacon instance is configured.</p>
						{/if}
					</div>
				{/key}
			</div>
			<Button href={resolve('/beacon-instances')}>Manage Instances</Button>
		</Card>
	</div>

	<h2>Launchpad</h2>

	<div class="launchpad-cards">
		<Card class="query-workbench">
			<div class="content">
				<h2>Query Workbench</h2>
				<p>Write queries, filter data and search millions of records.</p>
				<Button href={resolve('/queries/workbench')}>New Query</Button>
			</div>
			<div class="image">
				<img src={asset('/images/small-query-workbench.png')} alt="Query Workbench" />
			</div>
		</Card>

		<Card class="map-explorer">
			<div class="content">
				<h2>Map Explorer</h2>
				<p>Visualize spatial distributions and point observations on an interactive map.</p>
				<Button variant="outline" href={resolve('/visualisations/map-viewer')}
					>Go to Map Viewer</Button
				>
			</div>
			<div class="image">
				<img src={asset('/images/small-map-viewer.png')} alt="Map Viewer" />
			</div>
		</Card>

		<Card class="chart-explorer">
			<div class="content">
				<h2>Chart Explorer</h2>
				<p>Write queries, filter data and search millions of records.</p>
				<Button variant="outline" href={resolve('/visualisations/chart-explorer')}
					>Build a chart</Button
				>
			</div>
			<div class="image">
				<img src={asset('/images/small-chart-explorer.png')} alt="Chart Explorer" />
			</div>
		</Card>
	</div>

	<!-- <h2>Try out available nodes</h2>

	<Card class="available-nodes">
		<div class="table-scroll">
			<table class="available-nodes-table">
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
					{#each $openInstances as node (node.url)}
						{@const configured = configuredUrls.has(normalizeUrl(node.url))}
						{@const isSelected = selectedUrl === normalizeUrl(node.url)}
						<tr>
							<td class="node-name">{node.name}</td>
							<td class="node-description" title={node.description}>
								<span class="clamp">{node.description}</span>
							</td>
							<td class="node-url">
								<a href={node.url} rel="noopener noreferrer" target="_blank">{node.url}</a>
							</td>
							<td class="node-status">
								<BeaconInstanceStatus health={healthOf($healthMap, node.url)} variant="compact" />
							</td>
							<td class="node-actions">
								<Button onclick={() => connect(node)} disabled={isSelected}>
									{#if isSelected}
										Selected
									{:else if configured}
										Select
									{:else}
										Connect
									{/if}
								</Button>
							</td>
						</tr>
					{:else}
						<tr>
							<td class="no-nodes" colspan="5">No public nodes available.</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card> -->
</div>

<style lang="scss">
	.page-wrapper {
		padding: 2rem;

		:global(.card) {
			background-color: var(--background);
		}

		:global(.card.available-nodes) {
			padding: 0;
		}

		// A narrow screen scrolls the table. The page itself must not scroll.
		.table-scroll {
			overflow-x: auto;
		}

		table.available-nodes-table {
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

			// The description takes the room that the other columns leave. A
			// max-width on a cell does nothing here, because the auto table layout
			// sizes a column from its content.
			.node-description {
				width: 100%;
			}

			// The clamp needs a box of its own. A cell stretches to the height of
			// the row, so a clamp on the cell never cuts the text.
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

			.no-nodes {
				color: var(--muted-foreground);
				text-align: center;
			}

			a {
				color: var(--primary);
			}
		}

		.header {
			padding-bottom: 3rem;
			.title {
				.highlight {
					color: var(--highlight);
				}
			}
		}

		> h2:not(:first-of-type) {
			margin-top: 3rem;
		}

		.connected-instances {
			:global(.card-content) {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
			}
		}

		.current-node {
			// Grid stacks the outgoing and incoming .cycle-content in one cell, so
			// the crossfade overlaps in place instead of shifting the layout.
			display: grid;
			flex: 1;

			.cycle-content {
				grid-column: 1;
				grid-row: 1;
			}

			.no-instance {
				color: var(--muted-foreground);
			}

			.current-node-info {
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: 1rem;

				.name-url {
					display: flex;
					flex-direction: column;

					p {
						margin: 0;
						font-weight: bold;
					}
					.url {
						color: var(--primary);
					}
				}
			}
		}

		.launchpad-cards {
			display: grid;
			gap: 1rem;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

			:global(.card) {
				padding: 0;
				overflow: hidden;
			}

			:global(.card-content) {
				padding: 0;
				flex-grow: 1;
				display: flex;
				flex-direction: row;

				:global(.content) {
					padding: 1rem;
					flex: 0 0 50%;
					display: flex;
					flex-direction: column;

					:global(p) {
						flex-grow: 1;
					}
				}
				:global(.image) {
					padding-top: 3rem;
					padding-bottom: 1rem;
					:global(img) {
						border-radius: 0.5rem 0 0 0.5rem;
						border: 1px solid lightgray;
						border-right: 0;
						object-fit: cover;
						object-position: left;
						display: block;
						aspect-ratio: 1/0.8;
					}
				}
			}
		}
	}
</style>
