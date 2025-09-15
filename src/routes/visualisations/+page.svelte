<script lang="ts">
	import Card from "@/components/card/card.svelte";
	import Cookiecrumb from "@/components/cookiecrumb/cookiecrumb.svelte";
  	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>Visualisations - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Visualisations', href: '/visualisations' }]} />

<div class="page-container">
	<h1>Visualisations</h1>

	<p>
		Use the following ways to visualise your Beacon contents.
	</p>

    <div class="visualisation-functions">
		
		<Card href="{base}/visualisations/map-viewer">
			<h2>Map viewer</h2>
			<p>Visualise your data on an interactive map. Use the map viewer to explore geographical patterns and insights.</p>
		</Card>

		<Card href="{base}/visualisations/table-explorer">
			<h2>Table explorer</h2>
			<p>Explore your data in a tabular format. The table explorer allows for detailed examination and filtering of your dataset.</p>
		</Card>

		<Card href="{base}/visualisations/chart-explorer">
			<h2>Chart explorer</h2>
			<p>Explore your data using charts. The chart explorer allows for detailed examination and filtering of your dataset.</p>
		</Card>

    </div>

</div>


<style lang="scss">

.visualisation-functions {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

</style>