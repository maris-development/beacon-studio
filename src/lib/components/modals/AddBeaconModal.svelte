<!-- src/lib/components/AddBeaconModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '$lib/stores/config';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Utils } from '@/utils';
	import SaveIcon from '@lucide/svelte/icons/save';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { BeaconClient } from '@/beacon-api/client';
	import { addToast } from '@/stores/toasts';
	import { DatasetController } from 'chart.js';

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

	function closeModal(){
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
			closeModal();
			return;
		} 

		input = true;
	}

	async function submitForm() {
		const validConnection = await testConnection();

		console.log('Connection test result:', validConnection);

		if(!validConnection) return;

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


	type CheckConnectionState = "untested" | "testing" | "valid" | "invalid";

	let connectionCheckState: CheckConnectionState = "untested";

	async function testConnection(){
		if(connectionCheckState === "testing") return; // prevent multiple tests at once

		connectionCheckState = "testing";

		const testingInstance: BeaconInstance = {
			id: 'testing-instance',
			name: 'Testing Instance',
			url: url,
			description: description,
			token: token,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		const testingClient = BeaconClient.new(testingInstance);

		await Utils.sleep(330);

		let couldConnect = await testingClient.testConnection()

		if (couldConnect) {
			connectionCheckState = "valid";

		} else {
			connectionCheckState = "invalid";
			
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
		<Button type="button" variant="destructive" onclick={closeModal} data-connection-state={connectionCheckState}>
			Cancel
			<CircleXIcon />

			
		</Button>

		<div class="buttons-right">
			<Button variant="outline" onclick={testConnection}>
				{#if connectionCheckState === "untested"}
					Test connection
					<span class="connection-{connectionCheckState}"><LinkIcon /></span>

				{:else if connectionCheckState === "valid"}
					Connection valid
					<span class="connection-{connectionCheckState}"><CheckIcon /></span>

				{:else if connectionCheckState === "invalid"}
					Connection invalid
					<span class="connection-{connectionCheckState}"><TriangleAlertIcon /></span>

				{:else if connectionCheckState === "testing"}
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
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
