<script lang="ts">
	/**
	 * The one dialog that answers `askConfirm` and `askAlert`.
	 *
	 * The layout holds a single instance. No other component renders it.
	 */
	import Button from '@/components/buttons/Button.svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import { answerConfirm, confirmRequest } from '@/stores/confirm';

	/**
	 * Answers the question on Escape, and stops that key there.
	 *
	 * A modal that asked the question listens on the document as well. Without
	 * this guard one Escape would close both, and the user would lose the form
	 * behind the question. The listener runs in the capture phase, so it reaches
	 * the key first.
	 */
	$effect(() => {
		if (!$confirmRequest) return;

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;

			event.preventDefault();
			event.stopImmediatePropagation();
			answerConfirm(false);
		};

		document.addEventListener('keydown', onKeydown, true);

		return () => document.removeEventListener('keydown', onKeydown, true);
	});
</script>

{#if $confirmRequest}
	<div class="confirm-layer">
		<Modal title={$confirmRequest.title} onClose={() => answerConfirm(false)} width="440px">
			<p>{$confirmRequest.message}</p>

			{#if $confirmRequest.note}
				<p class="note">{$confirmRequest.note}</p>
			{/if}

			<div slot="footer" class="confirm-actions">
				{#if $confirmRequest.cancelLabel !== null}
					<Button variant="outline" onclick={() => answerConfirm(false)}>
						{$confirmRequest.cancelLabel ?? 'Cancel'}
					</Button>
				{/if}

				<Button
					variant={$confirmRequest.destructive ? 'destructive' : 'default'}
					onclick={() => answerConfirm(true)}
				>
					{$confirmRequest.confirmLabel ?? 'Continue'}
				</Button>
			</div>
		</Modal>
	</div>
{/if}

<style lang="scss">
	/**
	 * A modal that asks a question keeps its own backdrop at z-index 49. This
	 * layer owns a stacking context above that, so the question stays on top.
	 */
	.confirm-layer {
		position: relative;
		z-index: 60;
	}

	p {
		margin: 0;

		& + .note {
			margin-top: 0.5rem;
		}
	}

	.note {
		color: var(--muted-foreground);
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
