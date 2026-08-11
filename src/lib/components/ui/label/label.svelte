<!--
	A form label.

	This is a plain `<label>` element. bits-ui adds nothing here that the element
	does not already do: the browser handles the click-to-focus and the screen
	reader association through `for`, and the styling is ours.

	`size="sm"` is for a compact panel, such as the map legend or the plot
	configuration, where a full size label crowds the control it names.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		size = 'default',
		class: className = '',
		children,
		...restProps
	}: HTMLLabelAttributes & {
		ref?: HTMLLabelElement | null;
		size?: 'sm' | 'default';
		children?: Snippet;
	} = $props();
</script>

<label bind:this={ref} data-slot="label" data-size={size} class={className} {...restProps}>
	{@render children?.()}
</label>

<style lang="scss">
	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
		line-height: 1;
		user-select: none;

		&[data-size='sm'] {
			font-size: 0.6875rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--muted-foreground, #6b7280);
		}
	}
</style>
