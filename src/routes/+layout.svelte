<script lang="ts">
	import AppSidebar from '@/components/sidebar/AppSidebar.svelte';
	import Toasts from '@/components/toasts/Toasts.svelte';
	import { checkAllNodes, startHealthMonitor } from '@/services/beacon-node-connect';
	import { loadOpenNodes } from '@/services/open-nodes';
	import { loadHomeExamples } from '@/data/home-examples';
	import { FRESH_MS } from '@/services/beacon-node-health';
	import { importOpenNodes } from '@/services/open-nodes-import';
	import { onMount } from 'svelte';
	import '../app.scss';
	import '../tailwind.css';

	// One monitor for the whole app. It checks every node each hour.
	onMount(() => {
		// A failure leaves the list empty, so the import then adds nothing. The
		// monitor sweeps before the fetch answers, so the new nodes need a check.
		void loadOpenNodes()
			.then(importOpenNodes)
			.then(() => checkAllNodes(FRESH_MS));

		void loadHomeExamples();

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
