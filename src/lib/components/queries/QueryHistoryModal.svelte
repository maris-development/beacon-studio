<script lang="ts">
	import Modal from '@/components/modals/Modal.svelte';
	import StoredQueryTable from './StoredQueryTable.svelte';
	import { queryHistory } from '@/stores/query-history';
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

	// The newest run comes first.
	const entries = $derived(
		[...$queryHistory].sort((a, b) => (b.lastExecutedAt ?? 0) - (a.lastExecutedAt ?? 0))
	);

	async function deleteEntry(entry: StoredQuery): Promise<void> {
		const goAhead = await askConfirm({
			title: $t('history.delete.title'),
			message: $t('history.delete.message', { name: entry.name }),
			confirmLabel: $t('common.delete'),
			destructive: true
		});

		if (!goAhead) return;

		queryHistory.remove(entry.id);
	}
</script>

<Modal title={$t('history.title')} {onClose} width="960px">
	<StoredQueryTable
		{entries}
		kind="history"
		emptyText={$t('history.empty')}
		deleteTitle={$t('history.entry.remove')}
		{onOpen}
		onDelete={deleteEntry}
	/>
</Modal>
