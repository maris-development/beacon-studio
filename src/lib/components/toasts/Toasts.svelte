<script lang="ts">
	import { dismissToast, toasts, type IToast } from '@/stores/toasts';
	import { t } from '@/i18n';
	import Toast from './ToastItem.svelte';

	/** The shown text: the translated key, then the raw text. */
	function textOf(toast: IToast): string {
		if (!toast.key) return toast.message;

		const text = $t(toast.key, toast.values);
		if (toast.message) return `${text} ${toast.message}`;
		return text;
	}
</script>

{#if $toasts}
	<section>
		{#each $toasts as toast (toast.id)}
			<Toast
				type={toast.type}
				dismissible={toast.dismissible}
				on:dismiss={() => dismissToast(toast.id)}>{textOf(toast)}</Toast
			>
		{/each}
	</section>
{/if}

<style lang="postcss">
	section {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		width: 100%;
		display: flex;
		margin-top: 1rem;
		justify-content: center;
		flex-direction: column;
		z-index: 1000;
		pointer-events: none;
	}
</style>
