<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import Card from '@/components/card/card.svelte';
  	import { resolve } from '$app/paths';

</script>

<svelte:head>
	<title>Queries - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Queries', href: resolve('/queries') }]} />

<div class="page-container">
	<h1>Queries</h1>

	<p>Use the following ways to query your Beacon contents.</p>

	<div class="queries-functions">
		<Card href={resolve('/queries/query-builder')}>
				<h2>Query builder</h2>
			<p>
				Build queries using a user-friendly interface. There's two types of builders, the easy
				version provides you with a preset of columns, the advanced version allows for more column
				selection &amp; filter customization.
			</p>
		</Card>

		<Card href={resolve('/queries/query-editor')} class="card">
			<h2>Query editor</h2>
			
			<p>Edit queries in a raw text editor, this is for advanced users and developers.</p>
		</Card>
	</div>
</div>

<style lang="scss">
	.queries-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
