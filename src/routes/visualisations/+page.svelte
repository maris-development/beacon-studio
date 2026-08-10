<script lang="ts">
	import Card from '@/components/card/Card.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Visualisations - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Visualisations', href: '/visualisations' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h2>Visualisations</h2>

		<p>Use the following ways to visualise your Beacon contents.</p>

		<div class="visualisation-functions">
			<Card href={resolve('/visualisations/map-viewer')}>
				<h3>Map viewer</h3>
				<p>
					Visualise your data on an interactive map. Use the map viewer to explore geographical
					patterns and insights.
				</p>
			</Card>

			<Card href={resolve('/visualisations/table-explorer')}>
				<h3>Table explorer</h3>
				<p>
					Explore your data in a tabular format. The table explorer allows for detailed examination
					and filtering of your dataset.
				</p>
			</Card>

			<Card href={resolve('/visualisations/chart-explorer')}>
				<h3>Chart explorer</h3>
				<p>
					Explore your data using charts. The chart explorer allows for detailed examination and
					filtering of your dataset.
				</p>
			</Card>
		</div>
	</div>
</div>

<style lang="scss">
	.visualisation-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
