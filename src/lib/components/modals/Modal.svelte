<script lang="ts">
	/** Parent passes these in to handle save/close; optionally an instance for editing */
	export let onClose: () => void;
	export let title: string = '';

	let shortRandomString = crypto.randomUUID().slice(0, 8);
</script>

<div
	id="modal-backdrop-{shortRandomString}"
	class="backdrop"
	role="presentation"
	aria-hidden="true"
	on:click={onClose}
></div>

<div
	id="modal-{shortRandomString}"
	class="modal"
	role="dialog"
	aria-modal="true"
	aria-labelledby="modal-title-{shortRandomString}"
>
	<header id="modal-title-{shortRandomString}">{title}</header>
	<div id="modal-content-{shortRandomString}">
        <slot/>
    </div>
    <footer>
        <slot name="footer"/>
    </footer>
</div>

<style lang="scss">
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		cursor: default;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: #fff;
		padding: 1.5rem;
		border-radius: 0.5rem;
		width: 90%;
		max-width: 400px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);

        header {
			font-size: 1.25rem;
			margin-bottom: 1rem;
		}

        footer {
            margin-top: 1rem;
            text-align: right;

            
        }
	}
</style>
