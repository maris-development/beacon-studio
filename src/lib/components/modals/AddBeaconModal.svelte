<!-- src/lib/components/AddBeaconModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '$lib/stores/config';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Utils } from '@/utils';

	/** Parent passes these in to handle save/close; optionally an instance for editing */
	export let onSave: (instance: BeaconInstance) => void;
	export let onClose: () => void;
	export let instance: BeaconInstance | null = null;

	// form fields
	let name = '';
	let url = '';
	let description = '';
	let token = '';
	let input: boolean = false;

	/** Initialize form if editing */
	onMount(() => {
		document.addEventListener('keydown', handleKeydown);

		if (instance) {
			name = instance.name;
			url = instance.url;
			description = instance.description ?? '';
			token = instance.token ?? '';
		}

		return () => document.removeEventListener('keydown', handleKeydown);
	});

	function addBeaconClose(){
		// Reset form fields		
		if(input) {
			let confirmation = confirm('You have unsaved changes. Are you sure you want to close?');
			if (!confirmation) {
				return;
			}


		} 

		onClose();
	}

	/** Close when Escape is pressed */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			addBeaconClose();
			return;
		} 

		input = true;
	}

	function submit() {
		const now = new Date();

		const newInstance: BeaconInstance = {
			id: instance?.id ?? Utils.uuidv4(),
			name: name.trim(),
			url: url.trim(),
			description: description.trim() || '',
			token: token.trim() || '',
			createdAt: instance?.createdAt ?? now,
			updatedAt: now
		};

		onSave(newInstance);
	}
</script>

<Modal title={instance ? 'Edit Beacon instance' : 'Add Beacon instance'} onClose={addBeaconClose}>
	<form on:submit|preventDefault={submit}>
		<label>
			Name *
			<input type="text" bind:value={name} required />
		</label>

		<label>
			URL *
			<input type="url" bind:value={url} required />
		</label>

		<label>
			Description (optional)
			<textarea rows="2" bind:value={description}></textarea>
		</label>

		<label>
			Token (if required)
			<input type="text" bind:value={token} />
		</label>
	</form>

	<div slot="footer">
		<Button type="button" variant="destructive" onclick={addBeaconClose}>Cancel</Button>
		<Button type="submit" onclick={submit}>Save</Button>
	</div>
		
</Modal>


<style lang="scss">
	form {
		label {
			display: block;
			margin-bottom: 0.75rem;
			font-weight: 500;
		}
	}
</style>
