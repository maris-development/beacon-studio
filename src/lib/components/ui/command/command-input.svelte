<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import SearchIcon from "@lucide/svelte/icons/search";
	import { cn } from "$lib/utils.js";

	let {
		placeholder = "",
		ref = $bindable(null),
		class: className = "",
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<div class="command-input-wrapper" data-slot="command-input-wrapper">
	<SearchIcon class="command-input-icon" color="var(--muted-foreground)" size="1rem"/>
	<CommandPrimitive.Input
		type="text"
		data-slot="command-input"
		class={cn("command-input", className)}
		{placeholder}
		bind:ref
		bind:value
		{...restProps}
	/>
</div>

<style lang="scss">

	.command-input-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 1px solid var(--border);
		padding-inline: 0.75rem;
	}

	.command-input-wrapper :global(.command-input) {
		border: 0;
		flex-grow: 1;
		background: transparent;
		font-size: 0.875rem;
		padding-block: 0.75rem;
		outline: none;
 	}

	.command-input-wrapper :global(.command-input::placeholder) {
		color: var(--muted-foreground);
	}

	.command-input-wrapper :global(.command-input:disabled) {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>