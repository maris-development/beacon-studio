<script lang="ts">
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import type { BeaconNode } from '@/beacon-api/types';
	import { createViewSql } from '@/data-browser/tables';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { message, t, type Message } from '@/i18n';

	type Props = {
		node: BeaconNode;
		materialized: boolean;
		onClose: () => void;
		onCreated: (name: string) => void;
	};

	let { node, materialized, onClose, onCreated }: Props = $props();

	let name = $state('');
	let query = $state('SELECT ');
	let busy = $state(false);
	// A Message, or the raw text of a server error.
	let error: Message | string = $state('');

	let title = $derived.by(() => {
		if (materialized) return $t('dataBrowser.tables.view.titleMaterialized');
		return $t('dataBrowser.tables.view.title');
	});

	async function create() {
		if (name.trim() === '' || query.trim() === '') {
			error = message('dataBrowser.tables.view.missing');
			return;
		}

		busy = true;
		error = '';

		try {
			const sql = createViewSql(name.trim(), query, materialized);
			const done = await withAdmin(node, (client) => client.query(sql));
			if (done !== null) onCreated(name.trim());
		} catch (caught) {
			error = adminErrorMessage(caught);
		} finally {
			busy = false;
		}
	}
</script>

<Modal {title} {onClose} canCloseModal={!busy} width="640px">
	<div class="form">
		<div class="field">
			<Label for="view-name">{$t('common.name')}</Label>
			<Input id="view-name" bind:value={name} />
		</div>

		<div class="field">
			<Label for="view-query">{$t('dataBrowser.tables.view.query')}</Label>
			<textarea id="view-query" rows="8" bind:value={query} spellcheck="false"></textarea>
		</div>

		{#if typeof error !== 'string'}
			<p class="error" role="alert">{$t(error)}</p>
		{:else if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>{$t('common.cancel')}</Button>
		<Button onclick={create} disabled={busy}>{$t('dataBrowser.tables.create')}</Button>
	</div>
</Modal>

<style lang="scss">
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field {
		display: grid;
		gap: 0.375rem;
	}

	textarea {
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
		resize: vertical;
	}

	.error {
		margin: 0;
		color: var(--destructive);
		white-space: pre-wrap;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
