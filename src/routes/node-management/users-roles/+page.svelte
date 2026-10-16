<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import type { AuthRole, AuthUser, BeaconClient, PrivilegeTarget } from '@maris-development/beacon-client';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ShieldPlusIcon from '@lucide/svelte/icons/shield-plus';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminSessionRequired from '@/components/AdminSessionRequired.svelte';
	import SummaryCards from '@/components/users-roles/SummaryCards.svelte';
	import { currentNode } from '@/services/beacon-node';
	import {
		adminErrorMessage,
		adminPageState,
		signedInNodeIds,
		withAdmin,
		withAdminSession
	} from '@/services/admin-session';
	import UsersTable from '@/components/users-roles/UsersTable.svelte';
	import RolesPanel from '@/components/users-roles/RolesPanel.svelte';
	import NewUserDialog from '@/components/users-roles/NewUserDialog.svelte';
	import NewRoleDialog from '@/components/users-roles/NewRoleDialog.svelte';
	import AddRuleDialog from '@/components/users-roles/AddRuleDialog.svelte';
	import { membersOf } from '@/access/summary';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { t, translate, type MessageKey } from '@/i18n';

	type Phase = 'idle' | 'loading' | 'ready' | 'error';
	type Tab = 'users' | 'roles';

	function startTab(): Tab {
		if (page.url.searchParams.get('tab') === 'roles') return 'roles';
		return 'users';
	}

	let phase: Phase = $state('idle');
	// True during a reload that keeps the lists on screen.
	let refreshing = $state(false);
	let loadedUrl: string | null = null;
	let users: AuthUser[] = $state([]);
	let roles: AuthRole[] = $state([]);
	let error = $state('');
	let tab: Tab = $state(startTab());
	let needle = $state('');
	// The role open in the Roles tab. The panel falls back to the first role.
	let selectedRole: string | null = $state(null);
	let newUserOpen = $state(false);
	// The New role dialog from the toolbar or the Roles tab.
	let newRoleOpen = $state(false);
	// The role the Add rule dialog opens for.
	let addRuleFor: string | null = $state(null);
	// The user the New role dialog gives its role to.
	let newRoleFor: string | null = $state(null);

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let gate = $derived(adminPageState(node, $signedInNodeIds));

	// The page loads only with a session. Without one it shows the sign-in card, never the dialog.
	$effect(() => {
		const ready = nodeUrl !== null && gate === 'ready';

		untrack(() => {
			if (ready) {
				void load();
			} else {
				phase = 'idle';
				users = [];
				roles = [];
				selectedRole = null;
				loadedUrl = null;
			}
		});
	});

	async function load() {
		const current = node;
		if (!current) return;

		// A reload of the same node keeps the lists on screen.
		const background = phase === 'ready' && loadedUrl === current.url;
		if (background) {
			refreshing = true;
		} else {
			phase = 'loading';
		}

		try {
			const result = await withAdminSession(current, (client) =>
				Promise.all([client.admin.listAuthUsers(), client.admin.listAuthRoles()])
			);
			// A node switch or a sign-out during the call makes the result stale.
			if (current.url !== nodeUrl || !get(signedInNodeIds).has(current.id)) return;
			if (result === null) return;

			users = result[0];
			roles = [...result[1]].sort((a, b) => a.name.localeCompare(b.name));
			phase = 'ready';
			loadedUrl = current.url;
		} catch (caught) {
			if (current.url === nodeUrl) {
				if (background) {
					addToast({
						type: 'error',
						key: 'usersRoles.loadFailed',
						message: adminErrorMessage(caught)
					});
				} else {
					error = adminErrorMessage(caught);
					phase = 'error';
				}
			}
		} finally {
			refreshing = false;
		}
	}

	// Runs one admin call, then reloads. Returns true on success.
	async function change(
		fn: (admin: BeaconClient['admin']) => Promise<unknown>,
		failKey: MessageKey
	): Promise<boolean> {
		const current = node;
		if (!current) return false;

		let done = false;
		try {
			const result = await withAdmin(current, async (client) => {
				await fn(client.admin);
				return true;
			});
			// A null result means the user cancelled the sign-in.
			if (result === null) return false;
			done = true;
		} catch (caught) {
			addToast({ type: 'error', key: failKey, message: adminErrorMessage(caught) });
		}
		await load();
		return done;
	}

	function addRole(user: string, role: string) {
		void change((a) => a.grantRoleToUser(user, role), 'usersRoles.users.addRoleFailed');
	}

	function removeRole(user: string, role: string) {
		void change((a) => a.revokeRoleFromUser(user, role), 'usersRoles.users.removeRoleFailed');
	}

	async function deleteUser(user: AuthUser) {
		const current = node;
		if (!current) return;

		const sure = await askConfirm({
			title: translate('usersRoles.users.deleteTitle', { user: user.username }),
			message: translate('usersRoles.users.deleteMessage', {
				user: user.username,
				node: current.name
			}),
			confirmLabel: translate('common.delete'),
			destructive: true
		});
		if (!sure) return;

		const done = await change((a) => a.dropUser(user.username), 'usersRoles.users.deleteFailed');
		if (done) {
			addToast({ type: 'success', key: 'usersRoles.users.deleted', values: { user: user.username } });
		}
	}

	function removeRule(role: string, target: PrivilegeTarget, deny: boolean) {
		void change((a) => a.revokePrivilege(role, target, deny), 'usersRoles.roles.removeRuleFailed');
	}

	async function deleteRole(role: AuthRole) {
		const names = membersOf(role.name, users).map((user) => user.username);
		const sure = await askConfirm({
			title: translate('usersRoles.roles.deleteTitle', { role: role.name }),
			message: translate('usersRoles.roles.deleteMessage', {
				role: role.name,
				count: names.length,
				members: names.join(', ')
			}),
			confirmLabel: translate('common.delete'),
			destructive: true
		});
		if (!sure) return;

		const done = await change((a) => a.dropRole(role.name), 'usersRoles.roles.deleteFailed');
		if (done) {
			addToast({ type: 'success', key: 'usersRoles.roles.deleted', values: { role: role.name } });
			selectedRole = null;
		}
	}

	function closeNewRole() {
		newRoleOpen = false;
		newRoleFor = null;
	}

	function roleCreated(name: string) {
		selectedRole = name;
		// From a user's "New role…" the Users tab stays open.
		if (newRoleFor === null) selectTab('roles');
		closeNewRole();
		void load();
	}

	function selectTab(next: Tab) {
		if (next === tab) return;
		tab = next;
		needle = '';

		const url = new URL(page.url);
		if (next === 'roles') {
			url.searchParams.set('tab', 'roles');
		} else {
			url.searchParams.delete('tab');
		}
		// In dev, replaceState throws until the router has started.
		try {
			replaceState(url, {});
		} catch {
			// The tab still switches. Only the URL stays as it is.
		}
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('nav.item.usersRoles') })}</title>
</svelte:head>

<Cookiecrumb
	crumbs={[{ label: $t('nav.item.usersRoles'), href: resolve('/node-management/users-roles') }]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('nav.item.usersRoles')}</h1>

		<p>{$t('usersRoles.intro')}</p>

		<div class="toolbar">
			<NodePicker />

			{#if node && gate === 'ready'}
				<div class="toolbar-actions">
					<Button
						variant="outline"
						size="icon"
						aria-label={$t('usersRoles.refresh')}
						title={$t('usersRoles.refresh')}
						disabled={phase === 'loading' || refreshing}
						onclick={load}
					>
						<RefreshCwIcon />
					</Button>
					<Button
						variant="outline"
						disabled={phase !== 'ready'}
						onclick={() => (newRoleOpen = true)}
					>
						<ShieldPlusIcon />
						{$t('usersRoles.newRole')}
					</Button>
					<Button disabled={phase !== 'ready'} onclick={() => (newUserOpen = true)}>
						<UserPlusIcon />
						{$t('usersRoles.newUser')}
					</Button>
				</div>
			{/if}
		</div>

		{#if !node || gate === 'pick-node'}
			<p>{$t('usersRoles.pickNode')}</p>
		{:else if gate === 'sign-in'}
			<AdminSessionRequired {node} />
		{:else if phase === 'loading'}
			<p class="muted">{$t('usersRoles.loading')}</p>
		{:else if phase === 'error'}
			<p class="error">{$t('usersRoles.loadFailed')} {error}</p>
			<Button variant="outline" onclick={load}>{$t('usersRoles.tryAgain')}</Button>
		{:else if phase === 'ready'}
			<SummaryCards {users} {roles} />

			<div class="tabs-row">
				<div class="tabs" role="tablist">
					<button
						type="button"
						role="tab"
						id="users-tab"
						aria-controls="users-panel"
						class="tab"
						class:active={tab === 'users'}
						aria-selected={tab === 'users'}
						onclick={() => selectTab('users')}
					>
						{$t('usersRoles.tab.users')}
						<span class="pill">{users.length}</span>
					</button>
					<button
						type="button"
						role="tab"
						id="roles-tab"
						aria-controls="roles-panel"
						class="tab"
						class:active={tab === 'roles'}
						aria-selected={tab === 'roles'}
						onclick={() => selectTab('roles')}
					>
						{$t('usersRoles.tab.roles')}
						<span class="pill">{roles.length}</span>
					</button>
				</div>

				<div class="search">
					<SearchIcon size={16} />
					<Input
						type="search"
						bind:value={needle}
						placeholder={tab === 'users'
							? $t('usersRoles.filter.users')
							: $t('usersRoles.filter.roles')}
					/>
				</div>
			</div>

			{#if tab === 'users'}
				<div role="tabpanel" id="users-panel" aria-labelledby="users-tab">
					<UsersTable
						{users}
						{roles}
						{needle}
						onAddRole={addRole}
						onRemoveRole={removeRole}
						onNewRoleFor={(user) => (newRoleFor = user)}
						onDelete={deleteUser}
					/>
				</div>
			{:else}
				<div role="tabpanel" id="roles-panel" aria-labelledby="roles-tab">
					<RolesPanel
						{roles}
						{users}
						{needle}
						selected={selectedRole}
						onSelect={(role) => (selectedRole = role)}
						onNewRole={() => (newRoleOpen = true)}
						onAddRule={(role) => (addRuleFor = role)}
						onRemoveRule={removeRule}
						onAddMember={(role, user) => addRole(user, role)}
						onRemoveMember={(role, user) => removeRole(user, role)}
						onDelete={deleteRole}
					/>
				</div>
			{/if}
		{/if}
	</div>
</div>

{#if newUserOpen && node}
	<NewUserDialog
		{node}
		{roles}
		usernames={users.map((user) => user.username)}
		onClose={() => (newUserOpen = false)}
		onSaved={() => {
			newUserOpen = false;
			void load();
		}}
	/>
{/if}

{#if (newRoleOpen || newRoleFor !== null) && node}
	<NewRoleDialog {node} {roles} giveTo={newRoleFor} onClose={closeNewRole} onSaved={roleCreated} />
{/if}

{#if addRuleFor !== null && node}
	<AddRuleDialog
		{node}
		role={addRuleFor}
		onClose={() => (addRuleFor = null)}
		onSaved={() => {
			addRuleFor = null;
			void load();
		}}
	/>
{/if}

<style lang="scss">
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.toolbar-actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	.tabs-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--card);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
		cursor: pointer;

		&.active {
			background: color-mix(in srgb, var(--primary) 12%, transparent);
			color: var(--primary);
			font-weight: 500;

			.pill {
				background: var(--primary);
				color: var(--primary-foreground);
			}
		}
	}

	.pill {
		min-width: 1.25rem;
		padding: 0 0.375rem;
		border-radius: 999px;
		background: var(--muted);
		font-size: var(--font-size-xs);
		text-align: center;
	}

	.search {
		position: relative;
		width: 100%;
		max-width: 20rem;

		:global(svg) {
			position: absolute;
			top: 50%;
			left: 0.75rem;
			transform: translateY(-50%);
			color: var(--muted-foreground);
			pointer-events: none;
		}

		:global(input) {
			padding-left: 2.25rem;
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
