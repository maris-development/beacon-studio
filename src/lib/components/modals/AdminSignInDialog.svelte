<script lang="ts">
	/**
	 * The one dialog that answers `askSignIn`. The layout holds a single instance.
	 */
	import Button from '@/components/buttons/Button.svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import {
		AdminAuthError,
		adminErrorMessage,
		answerSignIn,
		signIn,
		signInRequest
	} from '@/services/admin-session';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	// A new request starts with an empty form.
	$effect(() => {
		if (!$signInRequest) return;

		username = '';
		password = '';
		error = '';
		busy = false;
	});

	// Escape closes this dialog only, not the modal that started the action.
	$effect(() => {
		if (!$signInRequest) return;

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;

			event.preventDefault();
			event.stopImmediatePropagation();
			answerSignIn(false);
		};

		document.addEventListener('keydown', onKeydown, true);

		return () => document.removeEventListener('keydown', onKeydown, true);
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		const request = $signInRequest;
		if (!request || busy) return;

		busy = true;
		error = '';

		try {
			await signIn(request.node, username, password);
			answerSignIn(true, request);
		} catch (caught) {
			if (caught instanceof AdminAuthError) {
				error = caught.message;
			} else {
				error = adminErrorMessage(caught);
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if $signInRequest}
	<div class="sign-in-layer">
		<Modal
			title="Sign in to Beacon node {$signInRequest.node.name}"
			onClose={() => answerSignIn(false)}
			width="440px"
		>
			<form id="admin-sign-in" onsubmit={submit}>
				<p class="node-url">{$signInRequest.node.url}</p>

				<div class="field">
					<Label for="admin-username">Username</Label>
					<Input id="admin-username" autocomplete="username" bind:value={username} required />
				</div>

				<div class="field">
					<Label for="admin-password">Password</Label>
					<Input
						id="admin-password"
						type="password"
						autocomplete="current-password"
						bind:value={password}
						required
					/>
				</div>

				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}
			</form>

			<div slot="footer" class="actions">
				<Button variant="outline" onclick={() => answerSignIn(false)}>Cancel</Button>
				<Button type="submit" form="admin-sign-in" disabled={busy}>
					{#if busy}
						Signing in...
					{:else}
						Sign in
					{/if}
				</Button>
			</div>
		</Modal>
	</div>
{/if}

<style lang="scss">
	// Same layer as `Confirm`: above the modal that started the action.
	.sign-in-layer {
		position: relative;
		z-index: 60;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field {
		display: grid;
		gap: 0.375rem;
	}

	.node-url {
		margin: 0;
		color: var(--muted-foreground);
		word-break: break-all;
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
