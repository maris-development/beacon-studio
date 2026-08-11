<script lang="ts">
	import AppSidebar from '@/components/sidebar/AppSidebar.svelte';
	import Toasts from '@/components/toasts/toasts.svelte';
	import '../app.scss';
	import '../tailwind.css';
</script>

<Toasts />

<div class="app-wrapper">
	<AppSidebar />
	<main class="main-content">
		<slot />
	</main>
</div>

<style global lang="scss">
	div.app-wrapper {
		display: flex;
		flex-direction: row;
		width: 100%;
		height: 100%;
		background-color: var(--color-background);
	}


	main.main-content {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;

		margin: 0;

		overflow-x: hidden;
	}

	
</style>
