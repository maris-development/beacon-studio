<!--
 QuickStartExamples — three real queries on the home page.

 Each card opens a share link. The payload carries the query, the name and the
 node, so the workbench needs no second parameter.
-->

<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import BracesIcon from '@lucide/svelte/icons/braces';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import MapIcon from '@lucide/svelte/icons/map';
	import Button from '@/components/buttons/Button.svelte';
	import Card from '@/components/card/Card.svelte';
	import { Badge } from '@/components/ui/badge/index.js';
	import { homeExamples, type HomeExample } from '@/data/home-examples';
	import { SHARE_LINK_PATH } from '@/stores/stored-query';

	const PENDING_HINT = 'Work in progress';
	const METRIC_HINT = 'Measured on a reference run. Your run can differ.';

	/** The share link of one example. */
	function exampleHref(example: HomeExample): string {
		return `${resolve(SHARE_LINK_PATH)}${example.shareQuery}`;
	}
</script>

<div class="section-head">
	<h2>Quick start examples</h2>
	<p class="lead">Three real queries. Open one to review the query in the query builder and plot it on the map.</p>
	<!-- <span class="pending" title={PENDING_HINT}>
		<Button variant="link" disabled>View all examples</Button>
	</span> -->
</div>

<div class="examples">
	{#each $homeExamples as example (example.title)}
		<Card class="example">
			<img
				class="shot"
				src={asset(`/images/${example.image}`)}
				alt="The result of the {example.title} query in the Map Viewer"
				width="1382"
				height="760"
				loading="lazy"
				decoding="async"
			/>

			<div class="body">
				<div class="source">
					<GlobeIcon />
					<span class="source-name">{example.sourceName}</span>
					<Badge variant="outline" class="table-name">{example.tableName}</Badge>
				</div>

				<h3>{example.title}</h3>
				<p class="description">{example.description}</p>

				<div class="metrics" title={METRIC_HINT}>
					<Badge variant="outline" class="rows">{example.rows.toLocaleString()} rows</Badge>
					<Badge variant="outline">{example.seconds} s</Badge>
					<Badge variant="outline">{example.format}</Badge>
				</div>

				<div class="actions">
					<Button variant="outline" href={exampleHref(example)}>
						<BracesIcon />
						Check query
					</Button>

					<!-- <span class="pending" title={PENDING_HINT}>
						<Button variant="default" disabled>
							<MapIcon />
							Load map area
						</Button>
					</span> -->
				</div>
			</div>
		</Card>
	{/each}
</div>

<style lang="scss">
	.section-head {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 1rem;

		h2 {
			margin: 0;
		}

		.lead {
			margin: 0;
			flex: 1;
			color: var(--muted-foreground);
		}
	}

	// A disabled button drops its pointer events, so a title on the button
	// itself never shows. The wrapper keeps the hover, and therefore the hint.
	.pending {
		display: inline-flex;
	}

	.examples {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));

		// The screenshot reaches the card edge, so the card holds no padding of
		// its own. The body below it supplies the padding instead.
		:global(.card.example) {
			padding: 0;
			overflow: hidden;
			height: 100%;
		}

		// `Card` puts every child inside this wrapper. The wrapper must fill the
		// card, else `flex` on the body below it has nothing to divide.
		:global(.card.example > .card-content) {
			display: flex;
			flex-direction: column;
			flex: 1;
		}

		.shot {
			display: block;
			width: 100%;
			height: auto;
			aspect-ratio: 16 / 9;
			object-fit: cover;
			object-position: center;
			border-bottom: 1px solid var(--card-border);
			background-color: var(--muted);
		}

		.body {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			padding: 1rem;
			// The card stretches to the tallest of the row. This pushes the
			// actions of every card to the same edge.
			flex: 1;

			h3 {
				margin: 0;
			}
		}

		.source {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 0.375rem;
			color: var(--muted-foreground);
			font-size: 0.875rem;

			:global(svg) {
				width: 0.875rem;
				height: 0.875rem;
				flex-shrink: 0;
			}

			:global(.table-name) {
				font-family: monospace;
			}
		}

		.description {
			margin: 0;
			// The descriptions differ in length. This keeps the action rows of
			// the three cards on one line.
			flex: 1;
		}

		.metrics {
			display: flex;
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0.375rem;

			// The row count is the number that a user reads first.
			:global(.rows) {
				background-color: var(--selected-background);
				border-color: var(--border);
				color: var(--primary);
			}
		}

		.actions {
			display: flex;
			flex-direction: row;
			gap: 0.5rem;
			width: 100%;
			margin-top: 0.25rem;

			// Both actions share the width. The wrapper must grow the same way
			// the sibling button does.
			> :global(.btn),
			.pending {
				flex: 1;
			}

			.pending :global(.btn) {
				width: 100%;
			}
		}
	}

	@media (max-width: 60rem) {
		.section-head {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}
	}
</style>
