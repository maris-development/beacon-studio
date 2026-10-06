<!--
	One node of an EXPLAIN plan and its children. The top three levels start open.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PlanTree from './PlanTree.svelte';
	import { viewOf } from '@/sql/plan';

	let { node, depth = 0 }: { node: Record<string, unknown>; depth?: number } = $props();

	let view = $derived(viewOf(node));
	let open = $state(depth < 3);
</script>

<div class="plan-node" class:nested={depth > 0}>
	<div class="head">
		<button
			type="button"
			class="toggle"
			class:hidden={view.children.length === 0 && view.fields.length === 0 && !view.details}
			aria-label={open ? 'Fold' : 'Unfold'}
			onclick={() => (open = !open)}
		>
			<ChevronRightIcon class="chevron {open ? 'open' : ''}" />
		</button>
		<span class="type">{view.type}</span>
		{#each view.badges as badge (badge)}
			<span class="badge">{badge}</span>
		{/each}
	</div>

	{#if open}
		{#each view.fields as [key, value] (key)}
			<div class="field"><span class="key">{key}:</span> {value}</div>
		{/each}
		{#if view.details}
			<pre class="details">{view.details}</pre>
		{/if}
		{#each view.children as child, index (index)}
			<PlanTree node={child} depth={depth + 1} />
		{/each}
	{/if}
</div>

<style lang="scss">
	.plan-node {
		font-family: monospace;
		font-size: 0.75rem;

		&.nested {
			margin-left: 0.75rem;
			padding-left: 0.75rem;
			border-left: 1px solid var(--border);
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0;
	}

	.toggle {
		display: flex;
		border: 0;
		background: none;
		color: var(--muted-foreground);
		cursor: pointer;

		&.hidden {
			visibility: hidden;
		}
	}

	.type {
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: var(--accent);
		font-weight: 600;
	}

	.badge {
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: var(--secondary);
		color: var(--muted-foreground);
	}

	.field {
		margin-left: 1.25rem;
		word-break: break-all;
	}

	.key {
		color: var(--muted-foreground);
	}

	.details {
		margin: 0.25rem 0 0.25rem 1.25rem;
		white-space: pre-wrap;
		color: var(--muted-foreground);
	}

	:global(.plan-node .chevron) {
		width: 0.875rem;
		height: 0.875rem;
		transition: transform 0.15s;
	}

	:global(.plan-node .chevron.open) {
		transform: rotate(90deg);
	}
</style>
