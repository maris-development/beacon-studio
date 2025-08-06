<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import type { Snippet } from "svelte";


	let {
		onEditClick = () => {},
        children
	}: {
		onEditClick: () => void;
        children?: Snippet
	} = $props();
</script>


<div class="my-ctrl-group">
	<Button onclick={() => onEditClick()}>
		Edit query JSON
		<FileJson2Icon size=1rem />
	</Button>
    {@render children?.()}

</div>

<style lang="scss">
	.my-ctrl-group {
		// largely copied from maplibregl's ctrl group
		padding: 0.5rem;
		background: #fff;
		border-radius: 4px;
		box-shadow: 0 0 0 2px rgba(0,0,0,.1);
		clear: both;
		pointer-events: auto;
		transform: translate(0);
		margin: 10px;

		// p {
		// 	margin: 0;
		// }
	}
</style>
