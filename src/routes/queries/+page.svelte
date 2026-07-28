<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
  	import { resolve } from '$app/paths';

</script>

<svelte:head>
	<title>Queries - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Queries', href: resolve('/queries') }]} />

<div class="page-wrapper">

<div class="page-container">
	<h2>Queries</h2>

	<p>Use the following ways to query your Beacon contents.</p>

	<div class="queries-functions">
		<Card href={resolve('/queries/workbench')}>
			<h3>Query Workbench</h3>
			<p>
				Build queries using a user-friendly interface.
			</p>
		</Card>

		<!-- <Card href={resolve('/queries/query-editor')} >
			<h3>Query editor</h3>
			
			<p>Edit queries in a raw text editor, this is for advanced users and developers.</p>
		</Card>
		 -->
		<Card href={resolve('/queries/saved')}>
			<h3>Saved queries</h3>

			<p>Queries you've explicitly saved from the workbench.</p>
		</Card>

		<Card href={resolve('/queries/history')} >
			<h3>Query history</h3>
			
			<p>View the history of executed queries.</p>
		</Card>
	</div>
</div>
</div>

<style lang="scss">
	.queries-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
