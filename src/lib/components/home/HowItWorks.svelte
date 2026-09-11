<!--
 HowItWorks — the three step guide on the home page.

 The user can hide the guide. The choice persists, so a return visit keeps the
 page short.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import Card from '@/components/card/Card.svelte';
	import Button from '@/components/buttons/Button.svelte';

	const STORAGE_KEY = 'beacon-studio.home.guide-open';

	type Step = {
		/** The step number, as the card shows it. */
		number: string;
		title: string;
		body: string;
	};

	const STEPS: Step[] = [
		{
			number: '01',
			title: 'Select node and table',
			body: 'Open the Query Workbench. Pick a connected node, then pick one data table on that node.'
		},
		{
			number: '02',
			title: 'Filter and query',
			body: 'Add the columns you need, then filter them. Set a depth range and time bounds. To limit the result to a region, draw the area with the Map Viewer tools.'
		},
		{
			number: '03',
			title: 'Explore, export and share',
			body: 'Download the result or view it in the Map Viewer. Check the values in the Table Explorer, or build a chart. Share the query to collaborate or to continue in another workspace.'
		}
	];

	let open = $state(true);

	// Read the choice after the mount. A read at the module load reaches no
	// storage on a prerender.
	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved !== null) open = saved === 'true';
	});

	function toggle(): void {
		open = !open;
		localStorage.setItem(STORAGE_KEY, String(open));
	}
</script>

<div class="section-head">
	<h2>How it works</h2>
	<p class="lead">Three steps from an empty query to your subset.</p>
	<Button variant="link" onclick={toggle}>{open ? 'Hide guide' : 'Show guide'}</Button>
</div>

{#if open}
	<div class="steps">
		{#each STEPS as step, index (step.number)}
			<Card class="step">
				<div class="step-head">
					<span class="step-number">{step.number}</span>
					<h3>{step.title}</h3>
				</div>
				<p>{step.body}</p>
			</Card>

			{#if index < STEPS.length - 1}
				<div class="step-arrow" aria-hidden="true">
					<ArrowRightIcon />
				</div>
			{/if}
		{/each}
	</div>
{/if}

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

	// The arrow sits in a track of its own, so it never takes the room that a
	// card needs. `auto-fit` cannot do that, because the arrow is a grid item.
	.steps {
		display: grid;
		grid-template-columns: 1fr auto 1fr auto 1fr;
		align-items: stretch;
		gap: 0.5rem;

		:global(.card.step) {
			height: 100%;
		}

		.step-head {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 0.75rem;
			padding-bottom: 0.5rem;

			h3 {
				margin: 0;
			}
		}

		.step-number {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			min-width: 1.75rem;
			padding: 0.125rem 0.375rem;
			border: 1px solid var(--card-border);
			border-radius: var(--radius-md);
			background-color: var(--muted);
			color: var(--muted-foreground);
			font-size: 0.875rem;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}

		.step-arrow {
			display: flex;
			align-items: center;
			color: var(--muted-foreground);
		}

		p {
			margin: 0;
		}
	}

	@media (max-width: 60rem) {
		.section-head {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}

		// One column stacks the cards. A right arrow points nowhere then.
		.steps {
			grid-template-columns: 1fr;

			.step-arrow {
				display: none;
			}
		}
	}
</style>
