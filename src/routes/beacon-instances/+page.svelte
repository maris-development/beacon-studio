<!--
	The node manager moved to `/beacon-nodes`. This page keeps a bookmark of the
	old address alive. It renders nothing and replaces the history entry, so the
	back button returns to the page before the link.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() => {
		void goto(resolve('/beacon-nodes'), { replaceState: true });
	});
</script>

<svelte:head>
	<title>Beacon Nodes - Beacon Studio</title>
	<meta name="robots" content="noindex" />
</svelte:head>
