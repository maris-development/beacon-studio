<script lang="ts">
	import AppSidebar from '@/components/sidebar/AppSidebar.svelte';
	import Confirm from '@/components/modals/Confirm.svelte';
	import Toasts from '@/components/toasts/Toasts.svelte';
	import { checkAllNodes, startHealthMonitor } from '@/services/beacon-node-connect';
	import { loadHomeExamples } from '@/data/home-examples';
	import { FRESH_MS } from '@/services/beacon-node-health';
	import { syncOpenNodes } from '@/services/open-nodes-import';
	import { initTelemetry, setRoute, track } from '@/telemetry';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import '../app.scss';
	import '../tailwind.css';

	// One monitor for the whole app. It checks every node each hour.
	onMount(() => {
		// A failure leaves the list empty, so the import then adds nothing. The
		// monitor sweeps before the fetch answers, so the new nodes need a check.
		void syncOpenNodes().then(() => checkAllNodes(FRESH_MS));

		void loadHomeExamples();

		const stopTelemetry = initTelemetry();
		const stopHealthMonitor = startHealthMonitor();

		return () => {
			stopTelemetry();
			stopHealthMonitor();
		};
	});

	// Runs on the first page as well, so it reports the entry page too.
	afterNavigate((navigation) => {
		setRoute(navigation.to?.route.id ?? null);
		track('page.view', { props: { from: navigation.from?.route.id ?? null } });
	});
</script>

<Toasts />

<div class="app-wrapper">
	<AppSidebar />
	<main class="main-content">
		<slot />
	</main>
</div>

<!-- Last in the tree, so the question paints above a modal that asked it. -->
<Confirm />

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
