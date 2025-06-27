<!-- src/lib/components/AddBeaconModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '$lib/stores/config';
	import { Button } from '$lib/components/ui/button/index.js';

	/** Parent passes these in to handle save/close; optionally an instance for editing */
	export let onSave: (instance: BeaconInstance) => void;
	export let onClose: () => void;
	export let instance: BeaconInstance | null = null;

	// form fields
	let name = '';
	let url = '';
	let description = '';
	let token = '';

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

	/** Close when Escape is pressed */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}

	function submit() {
		const now = new Date();

		const newInstance: BeaconInstance = {
			id: instance?.id ?? crypto.randomUUID(),
			name: name.trim(),
			url: url.trim(),
			description: description.trim() || undefined,
			token: token.trim() || undefined,
			createdAt: instance?.createdAt ?? now,
			updatedAt: now
		};

		onSave(newInstance);
	}
</script>

<Modal title={instance ? 'Edit Beacon instance' : 'Add Beacon instance'} onClose={onClose}>
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
		<Button type="button" variant="destructive" onclick={onClose}>Cancel</Button>
		<Button type="submit">Save</Button>
	</div>

		
		
</Modal>


<style lang="scss">
	form {
		label {
			display: block;
			margin-bottom: 0.75rem;
			font-weight: 500;

			input,
			textarea {
				width: 100%;
				padding: 0.5rem;
				margin-top: 0.25rem;
				border: 1px solid #ccc;
				border-radius: 0.25rem;
				font: inherit;
			}
			textarea {
				resize: vertical;
			}
		}
	}
</style>
