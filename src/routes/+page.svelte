<script lang="ts">
	import { instances } from '@/services/beacon-instance';
	import { ensureFresh, ensureHostInstance } from '@/services/beacon-instance-connect';
	// These two imports use the casing on disk. A different casing adds a
	// `svelte-check` error, and breaks a build on a case sensitive filesystem.
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import Card from '@/components/card/card.svelte';
	import HeroNetwork from '@/components/HeroNetwork.svelte';
	import BeaconInstanceStatus from '@/components/BeaconInstanceStatus.svelte';
	import HowItWorks from '@/components/home/HowItWorks.svelte';
	import QuickStartExamples from '@/components/home/QuickStartExamples.svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Button from '@/components/buttons/Button.svelte';

	import { asset, resolve } from '$app/paths';

	// The Connected Instances card cycles through every configured instance, so
	// each one needs a true status dot. `ensureFresh` skips a check that is not due.
	$effect(() => {
		for (const instance of $instances) void ensureFresh(instance);
	});

	const CYCLE_INTERVAL_MS = 5_000;

	/** Advances every `CYCLE_INTERVAL_MS`. The Connected Instances card uses it to
	 * step through `$instances`. */
	let cycleIndex = $state(0);

	/** The instance the Connected Instances card shows now, or `null` if none is configured. */
	let displayedInstance = $derived(
		$instances.length > 0 ? $instances[cycleIndex % $instances.length] : null
	);

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

<HeroNetwork />

<div class="page-wrapper">
	<div class="header">
		<h1 class="title">Welcome to Beacon <span class="highlight">Studio</span></h1>
		<p class="subtitle">Explore and analyse your Beacon node data</p>
	</div>

	<section class="home-section">
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
										<a
											class="url"
											href={displayedInstance.url}
											rel="noopener noreferrer"
											target="_blank">{displayedInstance.url}</a
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
	</section>

	<section class="home-section">
		<HowItWorks />
	</section>

	<section class="home-section">
		<QuickStartExamples />
	</section>

	<section class="home-section">
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

			<!-- for later updates -->

			<!-- <Card class="map-explorer">
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
			</Card> -->
		</div>
	</section>
</div>

<style lang="scss">
	.page-wrapper {
		padding: 2rem;

		:global(.card) {
			background-color: var(--background);
		}

		.header {
			padding-bottom: 3rem;
			.title {
				.highlight {
					color: var(--highlight);
				}
			}
		}

		.home-section + .home-section {
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
				max-width: 400px;
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

