<!--
	One numbered step of the plot configuration panel: "1. Plot type",
	"2. Bind data", "3. Properties".

	Each step collapses on its own. The panel is a narrow column beside the plot,
	and a user works on one step at a time, so an open step must not push the
	others off the screen.

	`summary` shows the current answer of a step while it is closed. Therefore a
	user can read the whole configuration without opening anything.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

	let {
		step,
		title,
		summary = null,
		open = $bindable(true),
		onOpenChange,
		children
	}: {
		/** The number in front of the title. */
		step: number;
		title: string;
		/** A short line with the current answer, shown while the step is closed. */
		summary?: string | null;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		children: Snippet;
	} = $props();

	function toggleOpen() {
		if (onOpenChange) {
			onOpenChange(true);
			return;
		}

		open = !open;
	}
</script>

<Collapsible.Root {open}>
	<section class="plot-section" class:open>
		<button type="button" class="section-header" onclick={toggleOpen}>
			<span class="step">{step}</span>

			<span class="titles">
				<span class="title">{title}</span>
				{#if summary && !open}
					<span class="summary">{summary}</span>
				{/if}
			</span>

			<ChevronDownIcon class="chevron" size={16} />
		</button>

		<Collapsible.Content>
			<div class="section-body">
				{@render children()}
			</div>
		</Collapsible.Content>
	</section>
</Collapsible.Root>

<style lang="scss">
	.plot-section {
		border: 1px solid var(--border, #e5e7eb);
		border-radius: 0.5rem;
		overflow: hidden;

		:global(.section-header) {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			width: 100%;
			padding: 0.625rem 0.75rem;
			background: none;
			border: 0;
			text-align: left;
			cursor: pointer;

			&:hover {
				background-color: var(--accent, #f3f4f6);
			}
		}

		// The chevron points down while the step is open, and right while it is
		// closed. One icon, rotated, so the two states cannot drift apart.
		:global(.chevron) {
			flex-shrink: 0;
			transition: transform 0.15s ease;
			transform: rotate(-90deg);
		}

		&.open :global(.chevron) {
			transform: rotate(0deg);
		}

		.step {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 1.375rem;
			height: 1.375rem;
			border-radius: 999px;
			background-color: var(--muted, #eef2ff);
			color: var(--muted-foreground, #4b5563);
			font-size: 0.75rem;
			font-weight: 600;
		}

		.titles {
			display: flex;
			flex-direction: column;
			min-width: 0;
			flex-grow: 1;
		}

		.title {
			font-size: 0.875rem;
			font-weight: 600;
		}

		.summary {
			font-size: 0.75rem;
			color: var(--muted-foreground, #6b7280);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.section-body {
			display: flex;
			flex-direction: column;
			gap: 0.875rem;
			padding: 0.25rem 0.75rem 0.875rem;
			border-top: 1px solid var(--border, #e5e7eb);
		}
	}
</style>
