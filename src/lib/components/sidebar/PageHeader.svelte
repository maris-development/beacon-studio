<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { resolve } from '$app/paths';
	import logo from '$lib/assets/logo-gradient.svg';

	let { onToggle }: { onToggle: () => void } = $props();
</script>

<header class="page-header">
	<button class="menu-toggle" aria-label="Open menu" onclick={onToggle}>
		<MenuIcon class="toggle-icon" />
	</button>
	<a class="header-link" href={resolve('/')}>
		<img src={logo} alt="Beacon Logo" class="beacon-logo" />
		<span class="app-name">Beacon Studio</span>
	</a>
</header>

<style lang="scss">
	// The bar carries the menu button on a phone. A wide screen shows the
	// sidebar itself, so it needs no bar.
	.page-header {
		display: none;
		flex-shrink: 0;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--sidebar);
		border-bottom: 1px solid var(--sidebar-border);

		@media (max-width: 767px) {
			display: flex;
		}

		.menu-toggle {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			background: none;
			border: none;
			cursor: pointer;
			padding: 0.375rem;
			border-radius: 0.375rem;
			color: inherit;

			:global(.toggle-icon) {
				width: 1.25rem;
				height: 1.25rem;
			}

			&:hover {
				background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
			}
		}

		.header-link {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			text-decoration: none;
			color: inherit;

			.beacon-logo {
				width: 1.5rem;
				height: 1.5rem;
			}

			.app-name {
				font-size: 1rem;
				font-weight: 600;
				line-height: 1.5rem;
				white-space: nowrap;
			}
		}
	}
</style>
