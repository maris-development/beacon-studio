<!--
	One numbered step of the query builder: a number, a title, one line of
	description and optional controls on the right.

	While `hint` is set, the step shows the hint in place of its content. The
	parent sets it until the step before this one is done.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		step,
		title,
		description,
		hint = null,
		actions,
		children
	}: {
		/** The position of the step, from 1. */
		step: number;
		title: string;
		description: string;
		/** The text that replaces the content while the step is disabled, or null. */
		hint?: string | null;
		/** The controls on the right of the header. */
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<section class="builder-step">
	<header class="step-header">
		<span class="step-number" aria-hidden="true">{step}</span>

		<div class="step-heading">
			<h3>{title}</h3>
			<p class="step-description">{description}</p>
		</div>

		{#if actions}
			<div class="step-actions">
				{@render actions()}
			</div>
		{/if}
	</header>

	{#if hint}
		<p class="step-hint">{hint}</p>
	{:else if children}
		<div class="step-body">
			{@render children()}
		</div>
	{/if}
</section>

<style lang="scss">
	.builder-step {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		.step-header {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.75rem;

			.step-number {
				display: inline-flex;
				flex-shrink: 0;
				align-items: center;
				justify-content: center;
				align-self: flex-start;
				width: 1.75rem;
				height: 1.75rem;
				border-radius: 50%;
				background-color: var(--muted);
				color: var(--primary);
				font-size: var(--font-size-sm);
				font-weight: 600;
			}

			.step-heading {
				flex: 1 1 12rem;
				min-width: 0;

				h3 {
					margin: 0;
				}

				.step-description {
					margin: 0.25rem 0 0;
					font-size: var(--font-size-sm);
					color: var(--muted-foreground);
				}
			}

			.step-actions {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.5rem;
			}
		}

		// Align the content with the title, past the number.
		.step-body,
		.step-hint {
			padding-left: 2.5rem;
		}

		.step-hint {
			margin: 0;
			color: var(--muted-foreground);
		}
	}
</style>
