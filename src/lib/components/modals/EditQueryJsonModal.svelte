<!-- src/lib/components/modals/EditQueryJsonModal.svelte -->
<script lang="ts">
	import SaveIcon from '@lucide/svelte/icons/save';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import QueryEditor from '@/components/query-editor/QueryEditor.svelte';
	import Modal from '$lib/components/modals/Modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	let { editQueryString = $bindable(), onClose = (saveQuery) => {} } = $props();
</script>

<Modal title="Edit query JSON" onClose={() => onClose(false)} width="80vw">
	<div class="buttons">
		<Button onclick={() => onClose()}>
			Save and execute
			<SaveIcon size="1rem" />
		</Button>
		<Button onclick={() => onClose(false)} variant="destructive">
			Cancel
			<CircleXIcon size="1rem" />
		</Button>
	</div>
	<QueryEditor bind:sourceCode={editQueryString} height="80vh" />
</Modal>

<style lang="scss">
	.buttons {
		display: flex;
		flex-direction: row;
		gap: 1rem;
		margin-bottom: 1rem;
	}
</style>