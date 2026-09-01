<script lang="ts">
	import AppSidebar from '@/components/sidebar/AppSidebar.svelte';
	import Toasts from '@/components/toasts/toasts.svelte';
	import { startHealthMonitor } from '@/services/beacon-instance-connect';
	import { loadOpenInstances } from '@/services/open-instances';
	import { importOpenInstances } from '@/services/open-instances-import';
	import { onMount } from 'svelte';
	import '../app.scss';
	import '../tailwind.css';

	// One monitor for the whole app. It checks every node each hour.
	onMount(() => {
		// A failure leaves the list empty, so the import then adds nothing.
		void loadOpenInstances().then(importOpenInstances);

		return startHealthMonitor();
	});
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
