<script lang="ts">
	import { onMount } from "svelte";
 
	/** Parent passes these in to handle save/close; optionally an instance for editing */
	export let onClose: () => void;
	export let canCloseModal: boolean = true;
	export let title: string = '';
	export let width: string = '500px';

	let shortRandomString = crypto.randomUUID().slice(0, 8);

	function closeModalOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
	

	onMount(() => {
		if(canCloseModal){
			//also add escape key listener to close modal
			document.addEventListener('keydown', closeModalOnEscape);
		}


		return () => {
			// Cleanup: remove event listener if it was added
			document.removeEventListener('keydown', closeModalOnEscape);
		};
	})
</script>

<div
	id="modal-backdrop-{shortRandomString}"
	class="backdrop"
	role="presentation"
	aria-hidden="true"
	on:click={() => canCloseModal ? onClose() : undefined} 
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
			{title}
			{#if canCloseModal}
				<button class="close-button" on:click={onClose} aria-label="Close modal"> &times; </button>
			{/if}
		</header>
		<div id="modal-content-{shortRandomString}">
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
		z-index: 100;

		.modal {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: #fff;
			padding: 1rem;
			border-radius: 0.5rem;
			width: 90%;
			max-width: var(--width, 400px);
			box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);

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
