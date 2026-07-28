<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import { cn, Utils, type WithElementRef } from "$lib/utils.js";
	import { onMount } from "svelte";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	> & {
		label?: string;
	};

	const uid = $props.id();


	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		label: labelText,
		id = uid,
		...restProps
	}: Props = $props();

	
</script>


<div class="input-row">
	{#if labelText}
		<label for={id} class="input-label">{labelText}</label>
	{/if}

	{#if type === "file"}
		<input
			{id}
			bind:this={ref}
			data-slot="input"
			class={cn(
				"selection:bg-primary dark:bg-input/30 selection:text-primary-foreground border-input ring-offset-background placeholder:text-muted-foreground shadow-xs flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 pt-1.5 text-sm font-medium outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
				"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
				className
			)}
			type="file"
			bind:files
			{...restProps}
		/>
	{:else}
		<input
			{id}
			bind:this={ref}
			data-slot="input"
			class={cn(
				"border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground shadow-xs flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
				"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
				className
			)}
			{type}
			bind:value
			{...restProps}
		/>
	{/if}
</div>

<style lang="scss">
	.input-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex-grow: 1;

		input {
		}
	}

	.input-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}

</style>