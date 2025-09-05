<!-- src/lib/components/modals/NoQueryAvailableModal.svelte -->
<script lang="ts">
	import HammerIcon from '@lucide/svelte/icons/hammer';
	import Modal from '$lib/components/modals/Modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';

	let { 
        onCancel = () => {},
        openQueryJsonEditor = () => {},    
        
    } = $props();
</script>

<Modal title="No query to view" onClose={() => onCancel(false)} width="50vw">
    <p>Please build or enter a query to visualize data.</p>
	<div class="buttons">
        <Button href="/queries/query-builder">
			Build a query
    		<HammerIcon size=1rem />
		</Button>
        
		<Button onclick={openQueryJsonEditor}>
			Enter query JSON
    		<FileJson2Icon size=1rem />
		</Button>
	</div>
</Modal>

<style lang="scss">
	.buttons {
		display: flex;
		flex-direction: row;
		gap: 1rem;
		margin-bottom: 1rem;
	}
</style>