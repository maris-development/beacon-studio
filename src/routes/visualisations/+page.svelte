<script lang="ts">
	import Cookiecrumb from "@/components/cookiecrumb/cookiecrumb.svelte";




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
		
		<a href="/visualisations/map-viewer" class="function">
			<h2>Map viewer</h2>
			<p>Visualise your data on an interactive map. Use the map viewer to explore geographical patterns and insights.</p>
		</a>

		<a href="/visualisations/table-explorer" class="function">
			<h2>Table explorer</h2>
			<p>Explore your data in a tabular format. The table explorer allows for detailed examination and filtering of your dataset.</p>
		</a>
	
		<a href="/visualisations/chart-explorer" class="function">
			<h2>Chart explorer</h2>
			<p>Explore your data using charts. The chart explorer allows for detailed examination and filtering of your dataset.</p>
		</a>


    </div>

</div>


<style lang="scss">

.visualisation-functions {
	display: flex;
	flex-direction: column;
	gap: 1rem;

	.function {
		padding: 1rem;
		border: 1px solid #DDD;
		border-radius: 4px;
		text-decoration: none;
		color: inherit;
		background: #eee;

		&:hover {
			filter: brightness(85%);
		}
	}
}

</style>