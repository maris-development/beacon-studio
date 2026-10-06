<script lang="ts">
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';

	let datasetsTitle: string = $state('Datasets');
	let dataTablesTitle: string = $state('Data Tables');

	let nodeUrl = $derived($currentNode?.url ?? null);

	$effect(() => {
		if (!nodeUrl) return;
		untrack(() => count());
	});

	function plural(count: number, word: string): string {
		if (count === 1) return `1 ${word}`;
		return `${count.toLocaleString()} ${word}s`;
	}

	function count() {
		const node = $currentNode;
		if (!node) return;

		const client = makeBeaconClient(node);
		datasetsTitle = 'Datasets';
		dataTablesTitle = 'Data Tables';

		client.totalDatasets().then(
			(total) => {
				if (total > 0) datasetsTitle = plural(total, 'dataset');
			},
			() => {}
		);

		client.tables().then(
			(tables) => {
				if (tables.length > 0) dataTablesTitle = plural(tables.length, 'data table');
			},
			() => {}
		);
	}
</script>

<svelte:head>
	<title>Data Browser - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Data Browser', href: resolve('/data-browser') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>Data Browser</h1>

		<p>Use the data browser functions listed below to explore and manage your Beacon contents.</p>

		<div class="data-browser-functions">
			<Card href={resolve('/data-browser/datasets')}>
				<h3>{datasetsTitle}</h3>
				<p>View and manage individual datasets.</p>
			</Card>

			<Card href={resolve('/data-browser/data-tables')}>
				<h3>{dataTablesTitle}</h3>
				<p>View and manage data tables.</p>
			</Card>
		</div>
	</div>
</div>

<style lang="scss">
	.data-browser-functions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
