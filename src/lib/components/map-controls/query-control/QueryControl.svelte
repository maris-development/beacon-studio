<!-- MyMapControl.svelte -->
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	export let onEditClick: () => void;
	export let onReRunClick: () => void;
</script>

<!-- <Button onclick={() => onClick()}>
	Edit Query
	<SettingsIcon />
</Button> -->

<div class="my-ctrl-group">
		<p>Use the button below to edit the map query.</p>
		<Button
			class="text-center"
			title="Edit Query"
			onclick={onEditClick}
			><SettingsIcon size="16" /></Button>
		<Button
			class="text-center"
			title="Re-run Query"
			onclick={() => onReRunClick()}
			><RefreshCwIcon size="16" /></Button>

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

		p {
			margin: 0;
		}
	}
</style>
