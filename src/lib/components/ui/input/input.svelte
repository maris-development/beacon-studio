<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		id,
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		{id}
		bind:this={ref}
		data-slot="input"
		class={cn('input input--file', className)}
		type="file"
		bind:files
		{...restProps}
	/>
{:else}
	<input
		{id}
		bind:this={ref}
		data-slot="input"
		class={cn('input', className)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}

<style lang="scss">
	.input {
		display: flex;
		width: 100%;
		min-width: 0;
		height: 2.25rem;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--input);
		border-radius: calc(var(--radius) - 2px);
		background-color: var(--card);
		font-size: 1rem;
		line-height: 1.5rem;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		outline: none;
		transition-property: color, box-shadow;
		transition-duration: 150ms;

		&::placeholder {
			color: var(--muted-foreground);
		}

		&::selection {
			background-color: var(--primary);
			color: var(--primary-foreground);
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.5;
		}

		&:focus-visible {
			border-color: var(--ring);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent);
		}

		&[aria-invalid='true'] {
			border-color: var(--destructive);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 20%, transparent);
		}

		@media (min-width: 768px) {
			font-size: 0.875rem;
			line-height: 1.25rem;
		}
	}

	:global(.dark) .input[aria-invalid='true'] {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 40%, transparent);
	}

	.input--file {
		padding-top: 0.375rem;
		padding-bottom: 0;
		background-color: transparent;
		font-size: 0.875rem;
		line-height: 1.25rem;
		font-weight: 500;
	}
</style>
