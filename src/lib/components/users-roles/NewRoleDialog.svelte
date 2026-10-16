<script lang="ts">
	import { ApiError, type AuthRole } from '@maris-development/beacon-client';
	import ShieldPlusIcon from '@lucide/svelte/icons/shield-plus';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { createRoleFrom, stepFailureToast } from '@/access/actions';
	import { isValidName } from '@/access/names';
	import { ruleCount } from '@/access/summary';
	import { addToast } from '@/stores/toasts';
	import { message, t, type Message } from '@/i18n';

	type Props = {
		node: BeaconNode;
		roles: AuthRole[];
		// The user that gets the new role after the create.
		giveTo: string | null;
		onClose: () => void;
		onSaved: (role: string) => void;
	};

	let { node, roles, giveTo, onClose, onSaved }: Props = $props();

	let name = $state('');
	// The name of the role to copy the rules from. An empty string starts an empty role.
	let source = $state('');
	// Field errors show only after the first Save click.
	let attempted = $state(false);
	let exists = $state(false);
	// The raw server text of a failed save.
	let failure = $state('');
	let busy = $state(false);

	let nameError: Message | null = $derived.by(() => {
		if (!attempted) return null;
		const value = name.trim();
		if (value === '') return message('usersRoles.error.nameRequired');
		if (!isValidName(value)) return message('usersRoles.error.nameInvalid');
		// The server answers a duplicate with a plain 400, so the loaded list decides first.
		if (exists || roles.some((role) => role.name === value)) return message('usersRoles.error.exists');
		return null;
	});

	async function save() {
		attempted = true;
		exists = false;
		failure = '';
		if (nameError) return;

		busy = true;
		const role = name.trim();
		const from = roles.find((item) => item.name === source) ?? null;
		const user = giveTo;

		try {
			const failures = await withAdmin(node, async (client) => {
				const steps = await createRoleFrom(client.admin, role, from);
				if (user !== null) {
					try {
						await client.admin.grantRoleToUser(user, role);
					} catch (error) {
						steps.push({ step: user, error });
					}
				}
				return steps;
			});
			// A null result means the user cancelled the sign-in.
			if (failures === null) return;

			if (failures.length > 0) {
				addToast(stepFailureToast(failures, adminErrorMessage));
			} else {
				addToast({ type: 'success', key: 'usersRoles.newRoleDialog.created', values: { role } });
			}
			onSaved(role);
		} catch (caught) {
			if (caught instanceof ApiError && caught.status === 409) {
				exists = true;
			} else {
				failure = adminErrorMessage(caught);
			}
		} finally {
			busy = false;
		}
	}
</script>

<Modal
	title={$t('usersRoles.newRoleDialog.title')}
	subtitle={$t('usersRoles.newRoleDialog.subtitle')}
	{onClose}
	canCloseModal={!busy}
	width="560px"
>
	<div class="form">
		<div class="field">
			<Label for="new-role-name">
				{$t('usersRoles.newRoleDialog.name')}<span class="required" aria-hidden="true">*</span>
			</Label>
			<Input
				id="new-role-name"
				bind:value={name}
				oninput={() => (exists = false)}
				required
				autocomplete="off"
				spellcheck="false"
				aria-invalid={nameError !== null}
				placeholder={$t('usersRoles.newRoleDialog.namePlaceholder')}
			/>
			<span class="hint">{$t('usersRoles.nameHint')}</span>
			{#if nameError}
				<p class="error" role="alert">{$t(nameError)}</p>
			{/if}
		</div>

		{#if roles.length > 0}
			<div class="field">
				<Label for="new-role-source">{$t('usersRoles.newRoleDialog.startFrom')}</Label>
				<select id="new-role-source" bind:value={source}>
					<option value="">{$t('usersRoles.newRoleDialog.empty')}</option>
					{#each roles as role (role.name)}
						<option value={role.name}>
							{$t('usersRoles.newRoleDialog.copyOf', { role: role.name, count: ruleCount(role) })}
						</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if failure}
			<p class="error" role="alert">{failure}</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>{$t('common.cancel')}</Button>
		<Button onclick={save} disabled={busy}>
			<ShieldPlusIcon />
			{$t('usersRoles.newRoleDialog.create')}
		</Button>
	</div>
</Modal>

<style lang="scss">
	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: grid;
		align-content: start;
		gap: 0.375rem;
	}

	.required {
		margin-left: 0.125rem;
		color: var(--destructive);
	}

	// The same size as `Input`.
	select {
		width: 100%;
		height: 2.25rem;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--input);
		border-radius: calc(var(--radius) - 2px);
		background: var(--card);
		font-size: var(--font-size-md);

		@media (min-width: 768px) {
			font-size: var(--font-size-sm);
		}
	}

	.hint {
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	.error {
		margin: 0;
		color: var(--destructive);
		font-size: var(--font-size-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
