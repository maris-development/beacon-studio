<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
</script>

<Sidebar.Provider>
	<AppSidebar />
	<main class="main-content">
			<!-- this is where the current page’s +page.svelte will render -->
			<slot />
	</main>
</Sidebar.Provider>

<style lang="scss">
	.main-content {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		background-color: white;

		--margin: 0.75rem;
		margin: var(--margin);
		border-radius: 1rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

		min-height: calc(100vh - var(--margin) * 2);
		overflow: hidden;
	}
</style>
