<script lang="ts">
	import AppSidebar from '@/components/sidebar/AppSidebar.svelte';
	import PageHeader from '@/components/sidebar/PageHeader.svelte';
	import Confirm from '@/components/modals/Confirm.svelte';
	import Toasts from '@/components/toasts/Toasts.svelte';
	import { checkAllNodes, startHealthMonitor } from '@/services/beacon-node-connect';
	import { loadHomeExamples } from '@/data/home-examples';
	import { FRESH_MS } from '@/services/beacon-node-health';
	import { syncOpenNodes } from '@/services/open-nodes-import';
	import { initTelemetry, setRoute, track } from '@/telemetry';
	import { afterNavigate } from '$app/navigation';
	import { onMount, type Snippet } from 'svelte';
	import '../app.scss';
	import '../tailwind.css';

	// The width at which the sidebar becomes an overlay.
	const MOBILE_QUERY = '(max-width: 767px)';

	let { children }: { children?: Snippet } = $props();

	// The sidebar and the page header both read these, so the layout owns them.
	let isMobile = $state(false);
	let collapsed = $state(false);

	// One monitor for the whole app. It checks every node each hour.
	onMount(() => {
		// A failure leaves the list empty, so the import then adds nothing. The
		// monitor sweeps before the fetch answers, so the new nodes need a check.
		void syncOpenNodes().then(() => checkAllNodes(FRESH_MS));

		void loadHomeExamples();

		const stopTelemetry = initTelemetry();
		const stopHealthMonitor = startHealthMonitor();

		// Follow the viewport width. The sidebar starts closed on a phone.
		const mobileQuery = window.matchMedia(MOBILE_QUERY);
		const applyMobile = (matches: boolean) => {
			isMobile = matches;
			collapsed = matches;
		};
		applyMobile(mobileQuery.matches);
		const onMobileChange = (event: MediaQueryListEvent) => applyMobile(event.matches);
		mobileQuery.addEventListener('change', onMobileChange);

		return () => {
			stopTelemetry();
			stopHealthMonitor();
			mobileQuery.removeEventListener('change', onMobileChange);
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
	<AppSidebar bind:collapsed {isMobile} />
	<div class="app-body">
		<PageHeader onToggle={() => (collapsed = !collapsed)} />
		<main class="main-content">
			{@render children?.()}
		</main>
	</div>
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


	div.app-body {
		flex-grow: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
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
