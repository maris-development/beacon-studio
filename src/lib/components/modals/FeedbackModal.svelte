<!-- src/lib/components/modals/FeedbackModal.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import Modal from '$lib/components/modals/Modal.svelte';
	import { getCurrentNode } from '@/services/beacon-node';
	import { diagnostics } from '@/telemetry';

	let { onClose = () => {} } = $props();

	const FEEDBACK_URL = 'https://beacon-datalake.org/studio-feedback';

	/**
	 * The form URL, with the state of this client in the query string.
	 *
	 * The website reads these parameters once, at the GET of the page, and puts
	 * them in the hidden `extra` field. They reach the e-mail on submit.
	 *
	 * Send the route id, never `location.href`: the query string of a Studio page
	 * holds the whole shared query payload.
	 *
	 * Send the node URL, never the node record: a record can hold a bearer token.
	 */
	function buildUrl(): string {
		const url = new URL(FEEDBACK_URL);

		if (typeof window === 'undefined') return url.toString();

		const node = getCurrentNode();

		const fields: Record<string, string | null | undefined> = {
			...diagnostics(),
			route: page.route.id,
			node: node?.url,
			node_status: node?.status,
			viewport: `${window.innerWidth}x${window.innerHeight}`,
			locale: navigator.language,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
		};

		for (const [key, value] of Object.entries(fields)) {
			if (value) url.searchParams.set(key, value);
		}

		return url.toString();
	}

	// Build once. A new value on the `src` reloads the iframe and drops the typed text.
	const feedbackUrl = buildUrl();
</script>

<Modal title="Feedback" onClose={() => onClose()} width="900px">
	<div class="feedback-frame">
		<iframe
			src={feedbackUrl}
			title="Beacon Studio feedback form"
			loading="lazy"
			referrerpolicy="no-referrer"
		></iframe>
	</div>

	<p slot="footer" class="fallback">
		Does the form not load? <a href={feedbackUrl} target="_blank" rel="noopener noreferrer">
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
