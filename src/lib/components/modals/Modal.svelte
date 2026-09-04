<script lang="ts">
	import { Utils } from '@/utils';
	import { onMount } from 'svelte';

	/** Parent passes these in to handle save/close; optionally an instance for editing */
	export let onClose: () => void;
	export let canCloseModal: boolean = true;
	export let title: string = '';
	export let width: string = '500px';

	let shortRandomString = Utils.uuidv4().slice(0, 8);

	function closeModalOnEscape(event: KeyboardEvent) {
		// The test reads the value of now. A caller can block the close while a
		// task runs, and release it after.
		if (event.key === 'Escape' && canCloseModal) {
			onClose();
		}
	}

	onMount(() => {
		document.addEventListener('keydown', closeModalOnEscape);

		return () => {
			document.removeEventListener('keydown', closeModalOnEscape);
		};
	});
</script>

<div
	id="modal-backdrop-{shortRandomString}"
	class="backdrop"
	role="presentation"
	aria-hidden="true"
	on:click={() => (canCloseModal ? onClose() : undefined)}
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		id="modal-{shortRandomString}"
		class="modal"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="modal-title-{shortRandomString}"
		style="--width: {width};"
		on:click|stopPropagation
	>
		<header id="modal-title-{shortRandomString}">
			<h2>{title}</h2>
			{#if canCloseModal}
				<button class="close-button" on:click={onClose} aria-label="Close modal"> &times; </button>
			{/if}
		</header>
		<div id="modal-content-{shortRandomString}" class="modal-content">
			<slot />
		</div>
		<footer>
			<slot name="footer" />
		</footer>
	</div>
</div>

<style lang="scss">
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		cursor: default;
		z-index: 49;

		.modal {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: #fff;
			padding: 1rem;
			border-radius: 0.5rem;
			// A modal never takes more than 90% of the window, in both directions.
			// The header and the footer keep their place, and the content scrolls.
			display: flex;
			flex-direction: column;
			width: 90%;
			max-width: min(var(--width, 400px), 90vw);
			max-height: 90vh;
			box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);

			.modal-content {
				min-height: 0;
				overflow-y: auto;
			}

			header {
				font-size: 1.25rem;
				margin-bottom: 1rem;

				.close-button {
					background: none;
					border: none;
					font-size: 1.5rem;
					cursor: pointer;
					color: #333;
					position: absolute;
					top: 0.5rem;
					right: 0.5rem;
					width: 1rem;
					height: 1rem;
					line-height: 1rem;
					vertical-align: middle;

					&:hover {
						color: #000;
					}
				}
			}

			footer {
				margin-top: 1rem;
				text-align: right;
			}
		}
	}
</style>
