<script lang="ts">
	import Cookiecrumb from "@/components/cookiecrumb/cookiecrumb.svelte";




</script>

<svelte:head>
	<title>Queries - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Queries', href: '/queries' }]} />

<div class="page-container">
	<h1>Queries</h1>

	<p>
		Use the following ways to query your Beacon contents.
	</p>

    <div class="queries-functions">
		
		<a href="/queries/query-builder" class="function">
			<h2>Query builder</h2>
			<p>Build queries using a user-friendly interface. There's two types of builders, the easy version provides you with a preset of columns, the advanced version allows for more column selection &amp; filter customization.</p>
		</a>

		<a href="/queries/query-editor" class="function">
			<h2>Query editor</h2>
			<p>Edit queries in a raw text editor, this is for advanced users and developers.</p>
		</a>


    </div>

</div>


<style lang="scss">

.queries-functions {
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