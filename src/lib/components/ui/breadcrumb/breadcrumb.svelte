<script lang="ts">
	import type { WithElementRef } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		flexChildren = null,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		flexChildren: Snippet|null
	} = $props();
</script>

<div class="breadcrumb-container">
	<nav bind:this={ref} data-slot="breadcrumb" class={className} aria-label="breadcrumb" {...restProps}>
		{@render children?.()}
	</nav>
	{@render flexChildren?.()}
</div>

<style lang="scss">

.breadcrumb-container {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	border-bottom-width: 1px;
	border-color: #e5e7eb;
	background-color: #f9fafb;
	padding: 0.5rem 1rem; /* py-2 px-4 */
}

</style>