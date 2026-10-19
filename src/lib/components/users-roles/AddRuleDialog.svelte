<script lang="ts">
	import { onMount } from 'svelte';
	import type { PrivilegeTarget } from '@maris-development/beacon-client';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import type { BeaconNode } from '@/beacon-api/types';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { buildTree } from '@/sql/catalog';
	import { splitTree } from '@/data-browser/tables';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { describeTarget } from '@/access/summary';
	import { isValidName } from '@/access/names';
	import { t, type MessageKey } from '@/i18n';

	type Props = {
		node: BeaconNode;
		role: string;
		onClose: () => void;
		onSaved: () => void;
	};

	type Effect = 'grant' | 'deny';
	type Kind = PrivilegeTarget['type'];

	let { node, role, onClose, onSaved }: Props = $props();

	const EFFECTS: { value: Effect; label: MessageKey }[] = [
		{ value: 'grant', label: 'usersRoles.roles.grant' },
		{ value: 'deny', label: 'usersRoles.roles.deny' }
	];

	const KINDS: { value: Kind; label: MessageKey }[] = [
		{ value: 'all', label: 'usersRoles.addRuleDialog.all' },
		{ value: 'table', label: 'usersRoles.addRuleDialog.table' },
		{ value: 'path', label: 'usersRoles.addRuleDialog.path' }
	];

	let effect: Effect = $state('grant');
	let kind = $state<Kind>('all');
	let table = $state('');
	let path = $state('');
	// The table names of the default schema. Null while they load or after a load error.
	let tables: string[] | null = $state(null);
	let tablesFailed = $state(false);
	// The raw server text of a failed save.
	let failure = $state('');
	let busy = $state(false);

	let target: PrivilegeTarget = $derived.by(() => {
		if (kind === 'table') return { type: 'table', value: table.trim() };
		if (kind === 'path') return { type: 'path', value: path.trim() };
		return { type: 'all' };
	});

	// The SDK quotes a table as one identifier and throws on any other name.
	let tableInvalid = $derived(
		kind === 'table' && table.trim() !== '' && !isValidName(table.trim())
	);

	let ready = $derived(target.type === 'all' || (target.value !== '' && !tableInvalid));

	let effectLabel = $derived.by(() => {
		if (effect === 'deny') return $t('usersRoles.roles.deny');
		return $t('usersRoles.roles.grant');
	});

	onMount(() => {
		makeBeaconClient(node)
			.catalogs()
			.then(
				(view) => {
					const names = splitTree(buildTree(view))
						.defaultTables.map((item) => item.name)
						.filter(isValidName);
					tables = names;
					if (table === '' && names.length > 0) table = names[0];
				},
				() => (tablesFailed = true)
			);
	});

	async function save() {
		if (!ready) return;

		failure = '';
		busy = true;
		const chosen = target;
		const deny = effect === 'deny';

		try {
			const done = await withAdmin(node, async (client) => {
				await client.admin.grantPrivilege(role, chosen, deny);
				return true;
			});
			// A null result means the user cancelled the sign-in.
			if (done) onSaved();
		} catch (caught) {
			failure = adminErrorMessage(caught);
		} finally {
			busy = false;
		}
	}
</script>

<Modal
	title={$t('usersRoles.addRuleDialog.title', { role })}
	{onClose}
	canCloseModal={!busy}
	width="560px"
>
	<div class="form">
		<fieldset class="field">
			<legend>{$t('usersRoles.addRuleDialog.effect')}</legend>
			<div class="segments">
				{#each EFFECTS as item (item.value)}
					<label class="segment" class:active={effect === item.value}>
						<input type="radio" name="rule-effect" value={item.value} bind:group={effect} />
						{$t(item.label)}
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset class="field">
			<legend>{$t('usersRoles.addRuleDialog.target')}</legend>
			<div class="segments">
				{#each KINDS as item (item.value)}
					<label class="segment" class:active={kind === item.value}>
						<input type="radio" name="rule-target" value={item.value} bind:group={kind} />
						{$t(item.label)}
					</label>
				{/each}
			</div>
		</fieldset>

		{#if kind === 'table'}
			<div class="field">
				<Label for="rule-table">{$t('usersRoles.addRuleDialog.table')}</Label>
				{#if tablesFailed || (tables !== null && tables.length === 0)}
					<Input
						id="rule-table"
						bind:value={table}
						autocomplete="off"
						spellcheck="false"
						aria-invalid={tableInvalid}
					/>
					{#if tableInvalid}
						<p class="error" role="alert">{$t('usersRoles.error.nameInvalid')}</p>
					{/if}
				{:else if tables === null}
					<select id="rule-table" disabled>
						<option>{$t('usersRoles.addRuleDialog.tableLoading')}</option>
					</select>
				{:else}
					<select id="rule-table" bind:value={table}>
						{#each tables as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				{/if}
			</div>
		{:else if kind === 'path'}
			<div class="field">
				<Label for="rule-path">{$t('usersRoles.addRuleDialog.path')}</Label>
				<Input
					id="rule-path"
					class="mono"
					bind:value={path}
					autocomplete="off"
					spellcheck="false"
					placeholder={$t('usersRoles.addRuleDialog.pathPlaceholder')}
				/>
			</div>
		{/if}

		<p class="preview mono">
			{$t('usersRoles.addRuleDialog.preview', {
				effect: effectLabel,
				target: $t(describeTarget(target))
			})}
		</p>

		{#if failure}
			<p class="error" role="alert">{failure}</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>{$t('common.cancel')}</Button>
		<Button onclick={save} disabled={busy || !ready}>
			<PlusIcon />
			{$t('usersRoles.addRuleDialog.add')}
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
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.375rem;
		font-weight: 500;
	}

	.segments {
		display: inline-flex;
		justify-self: start;
		gap: 0.25rem;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--card);
	}

	.segment {
		position: relative;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
		cursor: pointer;

		// The radio stays in the tab order, the label shows its state.
		input {
			position: absolute;
			opacity: 0;
			pointer-events: none;
		}

		&:has(input:focus-visible) {
			outline: 2px solid var(--primary);
			outline-offset: 1px;
		}

		&.active {
			background: color-mix(in srgb, var(--primary) 12%, transparent);
			color: var(--primary);
			font-weight: 500;
		}
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

	.preview {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		background: var(--muted);
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
