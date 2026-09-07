<!-- src/lib/components/modals/FeedbackModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';

	let { onClose = () => {} } = $props();

	const FEEDBACK_URL = 'https://beacon-datalake.org/studio-feedback';
</script>

<Modal title="Feedback" onClose={() => onClose()} width="900px">
	<div class="feedback-frame">
		<iframe src={FEEDBACK_URL} title="Beacon Studio feedback form"></iframe>
	</div>

	<p slot="footer" class="fallback">
		Does the form not load? <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
			Open it in a new tab
		</a>.
	</p>
</Modal>

<style lang="scss">
	.feedback-frame {
		height: 70vh;

		iframe {
			width: 100%;
			height: 100%;
			border: 1px solid #e5e5e5;
			border-radius: 0.375rem;
			background: #fff;
		}
	}

	.fallback {
		margin: 0;
		text-align: left;
		font-size: 0.85rem;
		color: #6b7280;

		a {
			color: inherit;
		}
	}
</style>
