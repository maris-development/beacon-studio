<script lang="ts">
	import type { HTMLLiAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLLiAttributes> = $props();
</script>

<li
	bind:this={ref}
	data-slot="breadcrumb-item"
	class={cn("breadcrumb-item inline-flex items-center gap-1.5", className)}
	{...restProps}
>
	{@render children?.()}
</li>

<style lang="scss">

.breadcrumb-item {
	&:not(:first-of-type) {
		&::before {
  			content: '\203A';			
		}
	}
}

</style>