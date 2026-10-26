<script lang="ts">
	import Modal from '@/components/modals/Modal.svelte';
	import StoredQueryTable from './StoredQueryTable.svelte';
	import { savedQueries, removeSavedQuery } from '@/stores/saved-queries';
	import { askConfirm } from '@/stores/confirm';
	import type { StoredQuery } from '@/stores/stored-query';
	import { t } from '@/i18n';

	let {
		onOpen,
		onClose
	}: {
		onOpen: (entry: StoredQuery) => void;
		onClose: () => void;
	} = $props();

	// The store holds the newest save first.
	const entries = $derived([...$savedQueries]);

	async function deleteEntry(entry: StoredQuery): Promise<void> {
		const goAhead = await askConfirm({
			title: $t('saved.delete.title'),
			message: $t('saved.delete.message', { name: entry.name }),
			confirmLabel: $t('common.delete'),
			destructive: true
		});

		if (!goAhead) return;

		removeSavedQuery(entry.id);
	}
</script>

<Modal title={$t('saved.title')} {onClose} width="960px">
	<StoredQueryTable
		{entries}
		kind="saved"
		emptyText={$t('saved.empty')}
		deleteTitle={$t('saved.entry.remove')}
		{onOpen}
		onDelete={deleteEntry}
	/>
</Modal>
