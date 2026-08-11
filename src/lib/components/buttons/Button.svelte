<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "confirm" | "deny";
	export type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon";

	type ButtonVariantsOptions = {
		variant?: ButtonVariant;
		size?: ButtonSize;
	};

	const variantClass: Record<ButtonVariant, string> = {
		default: "variant-default",
		destructive: "variant-destructive",
		outline: "variant-outline",
		secondary: "variant-secondary",
		ghost: "variant-ghost",
		link: "variant-link",
		confirm: "variant-confirm",
		deny: "variant-deny"
	};

	const sizeClass: Record<ButtonSize, string> = {
		default: "size-default",
		xs: "size-xs",
		sm: "size-sm",
		lg: "size-lg",
		icon: "size-icon"
	};

	export function buttonVariants({ variant = "default", size = "default" }: ButtonVariantsOptions = {}) {
		return `btn ${variantClass[variant]} ${sizeClass[size]}`;
	}

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}

<style lang="scss">
	.btn {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		white-space: nowrap;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		line-height: 1.25rem;
		font-weight: 500;
		outline: none;
		transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
		cursor: pointer;
		border: 1px solid transparent;

		&:focus-visible {
			border-color: var(--focus-ring);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 50%, transparent);
		}

		&:disabled,
		&[aria-disabled='true'] {
			pointer-events: none;
			opacity: 0.5;
		}

		&[aria-invalid='true'] {
			border-color: var(--destructive);

			&:focus-visible {
				box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 20%, transparent);
			}
		}

		:global(.dark) &[aria-invalid='true']:focus-visible {
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 40%, transparent);
		}

		:global(svg) {
			pointer-events: none;
			flex-shrink: 0;

			&:not([class*='size-']) {
				width: 1rem;
				height: 1rem;
			}
		}

		&.size-xs {
			padding: 0.25rem;
		}
	}

	.size-default {
		height: 2.25rem;
		padding: 0.5rem 1rem;

		&:has(> :global(svg)) {
			padding-left: 0.75rem;
			padding-right: 0.75rem;
		}
	}

	.size-sm {
		height: 2rem;
		gap: 0.375rem;
		padding: 0 0.75rem;

		&:has(> :global(svg)) {
			padding-left: 0.625rem;
			padding-right: 0.625rem;
		}
	}

	.size-lg {
		height: 2.5rem;
		padding: 0 1.5rem;

		&:has(> :global(svg)) {
			padding-left: 1rem;
			padding-right: 1rem;
		}
	}

	.size-icon {
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
	}

	.variant-default {
		background-color: var(--primary);
		color: var(--primary-foreground);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);

		&:hover {
			background-color: color-mix(in srgb, var(--primary) 90%, transparent);
		}
	}

	.variant-destructive {
		background-color: var(--destructive);
		color: white;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);

		&:hover {
			background-color: color-mix(in srgb, var(--destructive) 90%, transparent);
		}

		&:focus-visible {
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 20%, transparent);
		}

		:global(.dark) & {
			background-color: color-mix(in srgb, var(--destructive) 60%, transparent);

			&:focus-visible {
				box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 40%, transparent);
			}
		}
	}

	.variant-outline {
		background-color: var(--background);
		border-color: var(--border);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);

		&:hover {
			background-color: var(--accent);
			color: var(--accent-foreground);
		}

		:global(.dark) & {
			background-color: color-mix(in srgb, var(--input) 30%, transparent);
			border-color: var(--input);

			&:hover {
				background-color: color-mix(in srgb, var(--input) 50%, transparent);
			}
		}
	}

	.variant-secondary {
		background-color: var(--secondary);
		color: var(--secondary-foreground);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);

		&:hover {
			background-color: color-mix(in srgb, var(--secondary) 80%, transparent);
		}
	}

	.variant-ghost {
		background-color: transparent;

		&:hover {
			background-color: var(--accent);
			color: var(--accent-foreground);
		}

		:global(.dark) &:hover {
			background-color: color-mix(in srgb, var(--accent) 50%, transparent);
		}
	}

	.variant-link {
		color: var(--primary);
		text-underline-offset: 4px;

		&:hover {
			text-decoration: underline;
		}
	}

	.variant-confirm {
		background-color: var(--confirm-background);
		color: var(--confirm-foreground);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		border-color: var(--confirm-border);

		&:hover {
			background-color: color-mix(in srgb, var(--confirm-background) 90%, transparent);
		}
	}

	.variant-deny {
		background-color: var(--deny-background);
		color: var(--deny-foreground);
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		border-color: var(--deny-border);

		&:hover {
			background-color: color-mix(in srgb, var(--deny) 90%, transparent);
		}
	}
</style>
