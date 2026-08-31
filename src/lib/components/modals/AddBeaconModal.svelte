<!-- src/lib/components/AddBeaconModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '@/beacon-api/types';
	import { addInstance, updateInstance, removeInstance } from '@/services/beacon-instance';
	import { testInstance } from '@/services/beacon-instance-connect';
	import Button from '$lib/components/buttons/Button.svelte';
	import { Utils } from '@/utils';
	import SaveIcon from '@lucide/svelte/icons/save';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { addToast } from '@/stores/toasts';

	/**
	 * The modal writes to the instance service itself. `onSave` tells the parent
	 * to close the form. `instance` switches the form to edit mode.
	 */
	export let onSave: () => void;
	export let onClose: () => void;
	export let instance: BeaconInstance | null = null;
	/**
	 * The URL to put in the form of a new node. A share link names a node that the
	 * app does not have. The user then adds it, and needs no copy and paste.
	 * `instance` wins over this, because an edit keeps the URL of the record.
	 */
	export let presetUrl: string | null = null;

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
		} else if (presetUrl) {
			url = presetUrl;

			// A name is required. Take the host, which the user can change.
			try {
				name = new URL(presetUrl).hostname;
			} catch {
				name = '';
			}
		}

		return () => document.removeEventListener('keydown', handleKeydown);
	});

	function closeModal() {
		// Reset form fields
		if (input) {
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
			closeModal();
			return;
		}

		input = true;
	}

	async function submitForm() {
		const validConnection = await testConnection();

		if (!validConnection) return;

		const values = { name, url, description, token };

		if (instance) {
			updateInstance(instance.id, values);
		} else {
			addInstance(values);
		}

		onSave();
	}

	function confirmRemove() {
		if (!instance) return;

		let confirmation = confirm(
			`Are you sure you want to remove the instance "${instance.name}"? This action cannot be undone.`
		);

		if (!confirmation) return;

		removeInstance(instance.id);

		addToast({
			message: `The Beacon instance "${instance.name}" has been deleted.`,
			type: 'info'
		});

		onSave();
	}

	type CheckConnectionState = 'untested' | 'testing' | 'valid' | 'invalid';

	let connectionCheckState: CheckConnectionState = 'untested';

	async function testConnection() {
		if (connectionCheckState === 'testing') return false; // prevent multiple tests at once

		connectionCheckState = 'testing';

		await Utils.sleep(330);

		const couldConnect = await testInstance({ url, token });

		if (couldConnect) {
			connectionCheckState = 'valid';
		} else {
			connectionCheckState = 'invalid';

			return false;
		}

		return true;
	}
</script>

<Modal title={instance ? 'Edit Beacon instance' : 'Add Beacon instance'} onClose={closeModal}>
	<form on:submit|preventDefault={submitForm}>
		<div class="form-row">
			<label for="name" class="required">Name</label>
			<input type="text" id="name" bind:value={name} required />
		</div>

		<div class="form-row">
			<label for="url" class="required">URL</label>
			<input type="url" id="url" bind:value={url} required />
		</div>

		<div class="form-row">
			<label for="description">Description</label>
			<textarea id="description" rows="2" bind:value={description}></textarea>
		</div>

		<div class="form-row">
			<label for="token" class="optional">Token</label>
			<input type="text" id="token" bind:value={token} />
		</div>
	</form>

	<div slot="footer" class="footer">
		<div class="buttons-left">
			<Button type="button" variant="outline" onclick={closeModal}>
				Cancel
				<CircleXIcon />
			</Button>

			<Button type="button" variant="destructive" onclick={confirmRemove} disabled={!instance}>
				Delete
				<Trash2Icon />
			</Button>
		</div>

		<div class="buttons-right">
			<Button variant="outline" onclick={testConnection}>
				{#if connectionCheckState === 'untested'}
					Test connection
					<span class="connection-{connectionCheckState}"><LinkIcon /></span>
				{:else if connectionCheckState === 'valid'}
					Connection valid
					<span class="connection-{connectionCheckState}"><CheckIcon /></span>
				{:else if connectionCheckState === 'invalid'}
					Connection invalid
					<span class="connection-{connectionCheckState}"><TriangleAlertIcon /></span>
				{:else if connectionCheckState === 'testing'}
					Testing...
					<span class="connection-{connectionCheckState}"><LoaderCircle /></span>
				{/if}
			</Button>
			<Button type="submit" onclick={submitForm}>
				Save
				<SaveIcon />
			</Button>
		</div>
	</div>
</Modal>

<style lang="scss">
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		label.required {
			&:after {
				content: '*';
				color: red;
				margin-left: 0.25rem;
			}
		}

		.form-row {
			display: flex;
			flex-direction: column;
		}
	}

	.footer {
		display: flex;
		justify-content: space-between;
		flex-direction: row;
	}

	.connection-invalid {
		color: red;
	}

	.connection-valid {
		color: green;
	}

	.connection-testing {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
