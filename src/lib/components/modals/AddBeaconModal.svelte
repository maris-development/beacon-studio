<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { removeNode } from '@/services/beacon-node';
	import { checkNode, testNode } from '@/services/beacon-node-connect';
	import { signedInNodeIds, signOut } from '@/services/admin-session';
	import {
		hasAdminInput,
		hasCompleteAdminInput,
		saveNodeForm,
		sessionSurvives,
		testAdminInput
	} from '@/services/node-form';
	import { settings } from '@/stores/settings';
	import Button from '$lib/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import { Utils } from '@/utils';
	import SaveIcon from '@lucide/svelte/icons/save';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { t, translate } from '@/i18n';

	/**
	 * The modal writes to the node service itself. `onSave` gets the saved node,
	 * or `null` after a delete. `node` switches the form to edit mode.
	 */
	export let onSave: (node: BeaconNode | null) => void;
	export let onClose: () => void;
	export let node: BeaconNode | null = null;
	/**
	 * The URL to put in the form of a new node. A share link names a node that the
	 * app does not have. The user then adds it, and needs no copy and paste.
	 * `node` wins over this, because an edit keeps the URL of the record.
	 */
	export let presetUrl: string | null = null;

	let name = '';
	let url = '';
	let description = '';
	let token = '';
	let adminUsername = '';
	let adminPassword = '';
	let adminUsernameRef: HTMLInputElement | null = null;
	let adminPasswordRef: HTMLInputElement | null = null;
	let input: boolean = false;
	let saving = false;

	// A new URL ends the session on save, so the form then asks for credentials again.
	$: signedIn = node !== null && $signedInNodeIds.has(node.id) && sessionSurvives(node, url);
	$: showAdminFields = $settings.adminFeatures && !signedIn;
	$: adminInput = showAdminFields ? { username: adminUsername, password: adminPassword } : null;
	$: adminRequired = hasAdminInput(adminInput);

	onMount(() => {
		document.addEventListener('keydown', handleKeydown);

		if (node) {
			name = node.name;
			url = node.url;
			description = node.description ?? '';
			token = node.token ?? '';
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

	async function closeModal() {
		if (input) {
			const goAhead = await askConfirm({
				title: translate('node.form.closeTitle'),
				message: translate('node.form.closeMessage'),
				note: translate('node.form.closeNote'),
				confirmLabel: translate('common.close'),
				destructive: true
			});

			if (!goAhead) return;
		}

		onClose();
	}

	// `Modal` closes on Escape. A second close here would ask the question twice.
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') return;

		input = true;
	}

	async function submitForm() {
		if (saving) return;
		saving = true;

		try {
			if (!(await testConnection())) return;

			const result = await saveNodeForm({ name, url, description, token }, adminInput, node?.id ?? null);
			if (!result) return;

			// The table shows this node right away. Without this, its status stays
			// "unknown" until the next sweep or page reload.
			void checkNode({ url, token });

			if (result.adminError) {
				addToast({
					key: 'node.form.adminFailed',
					values: { name: result.node.name },
					message: result.adminError,
					type: 'warning'
				});
			}

			onSave(result.node);
		} finally {
			saving = false;
		}
	}

	async function confirmRemove() {
		if (!node) return;

		const goAhead = await askConfirm({
			title: translate('node.delete.title'),
			message: translate('node.delete.message', { name: node.name }),
			note: translate('node.delete.note'),
			confirmLabel: translate('common.delete'),
			destructive: true
		});

		if (!goAhead) return;

		removeNode(node.id);

		addToast({
			key: 'node.toast.deleted',
			values: { name: node.name },
			type: 'info'
		});

		onSave(null);
	}

	type CheckConnectionState = 'untested' | 'testing' | 'valid' | 'invalid';

	let connectionCheckState: CheckConnectionState = 'untested';
	let adminCheckState: 'untested' | 'valid' | 'invalid' = 'untested';
	let adminError = '';

	async function testConnection() {
		if (connectionCheckState === 'testing') return false; // prevent multiple tests at once

		connectionCheckState = 'testing';

		await Utils.sleep(330);

		const couldConnect = await testNode({ url, token });

		if (couldConnect) {
			connectionCheckState = 'valid';
		} else {
			connectionCheckState = 'invalid';

			return false;
		}

		return true;
	}

	// The submit signs in itself, so only this button tests the admin fields.
	async function testAll() {
		resetAdminCheck();

		if (!(await testConnection()) || !hasAdminInput(adminInput)) return;

		// A half pair goes nowhere. The browser marks the empty field.
		if (!hasCompleteAdminInput(adminInput)) {
			if (adminUsername === '') {
				adminUsernameRef?.reportValidity();
			} else {
				adminPasswordRef?.reportValidity();
			}
			return;
		}

		const error = await testAdminInput(url, adminInput);

		if (error) {
			adminCheckState = 'invalid';
			adminError = error;
		} else {
			adminCheckState = 'valid';
		}
	}

	function resetAdminCheck() {
		adminCheckState = 'untested';
		adminError = '';
	}
</script>

<Modal title={node ? $t('node.form.editTitle') : $t('node.form.addTitle')} onClose={closeModal}>
	<form id="node-form" on:submit|preventDefault={submitForm}>
		<p class="intro">{$t('node.form.intro')}</p>

		<div class="form-row">
			<Label for="name" class="required">{$t('common.name')}</Label>
			<Input id="name" placeholder={$t('node.form.namePlaceholder')} bind:value={name} required />
		</div>

		<div class="form-row">
			<Label for="url" class="required">{$t('node.field.url')}</Label>
			<Input
				type="url"
				id="url"
				placeholder={$t('node.form.urlPlaceholder')}
				bind:value={url}
				oninput={resetAdminCheck}
				required
			/>
			<p class="hint">{$t('node.form.urlHint')}</p>
		</div>

		<div class="form-row">
			<Label for="description">{$t('node.field.description')}</Label>
			<textarea id="description" rows="3" bind:value={description}></textarea>
		</div>

		<div class="form-row">
			<Label for="token">{$t('node.field.token')}</Label>
			<Input id="token" placeholder={$t('node.form.tokenPlaceholder')} bind:value={token} />
			<p class="hint">{$t('node.form.tokenHint')}</p>
		</div>

		{#if $settings.adminFeatures}
			<fieldset class="admin-box">
				<legend><ShieldCheckIcon size={18} />{$t('node.form.adminTitle')}</legend>

				{#if signedIn && node}
					<div class="admin-session">
						<span>{$t('node.form.adminSignedIn')}</span>
						<Button type="button" variant="outline" onclick={() => node && signOut(node.id)}>
							<LogOutIcon />
							{$t('node.form.adminSignOut')}
						</Button>
					</div>
				{:else}
					<div class="admin-fields">
						<div class="form-row">
							<Label for="admin-username">{$t('node.form.adminUsername')}</Label>
							<Input
								id="admin-username"
								autocomplete="username"
								placeholder={$t('admin.signIn.usernamePlaceholder')}
								bind:ref={adminUsernameRef}
								bind:value={adminUsername}
								oninput={resetAdminCheck}
								required={adminRequired}
							/>
						</div>
						<div class="form-row">
							<Label for="admin-password">{$t('node.form.adminPassword')}</Label>
							<Input
								id="admin-password"
								type="password"
								autocomplete="current-password"
								bind:ref={adminPasswordRef}
								bind:value={adminPassword}
								oninput={resetAdminCheck}
								required={adminRequired}
							/>
						</div>
					</div>

					{#if adminCheckState === 'valid'}
						<p class="admin-result valid">{$t('node.form.adminValid')}</p>
					{:else if adminCheckState === 'invalid'}
						<p class="admin-result invalid" role="alert">{adminError}</p>
					{/if}
				{/if}
			</fieldset>
		{/if}
	</form>

	<div slot="footer" class="footer">
		<div class="buttons-left">
			<Button type="button" variant="outline" onclick={testAll}>
				{#if connectionCheckState === 'untested'}
					<span class="connection-{connectionCheckState}"><ActivityIcon /></span>
					{$t('node.connection.test')}
				{:else if connectionCheckState === 'valid'}
					<span class="connection-{connectionCheckState}"><CheckIcon /></span>
					{$t('node.connection.valid')}
				{:else if connectionCheckState === 'invalid'}
					<span class="connection-{connectionCheckState}"><TriangleAlertIcon /></span>
					{$t('node.connection.invalid')}
				{:else if connectionCheckState === 'testing'}
					<span class="connection-{connectionCheckState}"><LoaderCircle /></span>
					{$t('node.connection.testing')}
				{/if}
			</Button>

			{#if node}
				<Button type="button" variant="destructive" onclick={confirmRemove}>
					<Trash2Icon />
					{$t('common.delete')}
				</Button>
			{/if}
		</div>

		<div class="buttons-right">
			<Button type="button" variant="outline" onclick={closeModal}>
				{$t('common.cancel')}
			</Button>
			<Button type="submit" form="node-form" disabled={saving}>
				{#if node}
					<SaveIcon />
					{$t('common.save')}
				{:else}
					<PlusIcon />
					{$t('node.form.submitAdd')}
				{/if}
			</Button>
		</div>
	</div>
</Modal>

<style lang="scss">
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: left;

		:global(label.required)::after {
			content: '*';
			color: var(--destructive);
			margin-left: 0.25rem;
		}

		.form-row {
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
		}

		textarea {
			padding: 0.5rem 0.75rem;
			border: 1px solid var(--input);
			border-radius: var(--radius);
			background: transparent;
			font-size: var(--font-size-sm);
			resize: vertical;
		}
	}

	.intro,
	.hint {
		margin: 0;
		color: var(--muted-foreground);
	}

	.hint {
		font-size: var(--font-size-sm);
	}

	.admin-box {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);

		legend {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0 0.25rem;
			font-weight: 600;
		}

		.admin-fields {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 1rem;

			@media (max-width: 480px) {
				grid-template-columns: 1fr;
			}
		}

		.admin-session {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
		}

		.admin-result {
			margin: 0;
			font-size: var(--font-size-sm);

			&.valid {
				color: MediumSeaGreen;
			}

			&.invalid {
				color: var(--destructive);
			}
		}
	}

	.footer {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;

		.buttons-left,
		.buttons-right {
			display: flex;
			gap: 0.5rem;
		}
	}

	.connection-invalid {
		color: var(--destructive);
	}

	.connection-valid {
		color: MediumSeaGreen;
	}

	.connection-testing {
		display: inline-flex;
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
