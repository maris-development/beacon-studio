<script lang="ts">
	import type { AuthRole, AuthUser } from '@maris-development/beacon-client';
	import InfoIcon from '@lucide/svelte/icons/info';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import ShieldPlusIcon from '@lucide/svelte/icons/shield-plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { t } from '@/i18n';
	import { accessSummary, filterUsers, rolesToAdd, ruleCount, sortUsers } from '@/access/summary';
	import UserAvatar from './UserAvatar.svelte';
	import AccessCell from './AccessCell.svelte';

	let {
		users,
		roles,
		needle,
		onAddRole,
		onRemoveRole,
		onNewRoleFor,
		onDelete
	}: {
		users: AuthUser[];
		roles: AuthRole[];
		needle: string;
		onAddRole: (user: string, role: string) => void;
		onRemoveRole: (user: string, role: string) => void;
		onNewRoleFor: (user: string) => void;
		onDelete: (user: AuthUser) => void;
	} = $props();

	let rows = $derived(sortUsers(filterUsers(users, needle)));

	function isLocal(user: AuthUser): boolean {
		return !user.is_super_user && !user.is_anonymous;
	}

	function userLine(user: AuthUser) {
		if (user.is_super_user) return 'usersRoles.users.line.superUser';
		if (user.is_anonymous) return 'usersRoles.users.line.anonymous';
		if (user.roles.length === 0) return 'usersRoles.users.line.noRole';
		return null;
	}
</script>

<div class="card">
	<table>
		<thead>
			<tr>
				<th>{$t('usersRoles.users.col.user')}</th>
				<th>{$t('usersRoles.users.col.roles')}</th>
				<th>{$t('usersRoles.users.col.access')}</th>
				<th class="actions"></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as user (user.username)}
				{@const line = userLine(user)}
				<tr>
					<td>
						<div class="user">
							<UserAvatar {user} />
							<div class="user-text">
								<span class="name-row">
									<strong>{user.username}</strong>
									{#if user.is_super_user}
										<span class="badge super">{$t('usersRoles.users.badge.superUser')}</span>
									{:else if user.is_anonymous}
										<span class="badge outline">{$t('usersRoles.users.badge.anonymous')}</span>
									{/if}
								</span>
								{#if line}
									<span class="sub">{$t(line)}</span>
								{/if}
							</div>
						</div>
					</td>
					<td>
						{#if user.is_super_user}
							<span class="sub">{$t('usersRoles.users.noRoleNeeded')}</span>
						{:else}
							{@const addable = rolesToAdd(user, roles)}
							<div class="chips">
								{#each user.roles as role (role)}
									<span class="chip">
										{role}
										<button
											type="button"
											aria-label={$t('usersRoles.users.removeRole', { role })}
											onclick={() => onRemoveRole(user.username, role)}
										>
											<XIcon size={14} />
										</button>
									</span>
								{/each}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger class="add-role">
										<PlusIcon size={14} />
										{$t('usersRoles.users.addRole')}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start" class="users-roles-add-role-menu">
										<DropdownMenu.Label class="add-role-label">
											{$t('usersRoles.users.addRoleTo', { user: user.username })}
										</DropdownMenu.Label>
										{#each addable as role (role.name)}
											<DropdownMenu.Item
												class="add-role-item"
												onSelect={() => onAddRole(user.username, role.name)}
											>
												<ShieldIcon />
												<span class="role-name">{role.name}</span>
												<span class="sub"
													>{$t('usersRoles.ruleCount', { count: ruleCount(role) })}</span
												>
											</DropdownMenu.Item>
										{/each}
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											class="add-role-item"
											onSelect={() => onNewRoleFor(user.username)}
										>
											<ShieldPlusIcon />
											{$t('usersRoles.users.newRoleItem')}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						{/if}
					</td>
					<td><AccessCell summary={accessSummary(user, roles)} /></td>
					<td class="actions">
						{#if isLocal(user)}
							<button
								type="button"
								class="trash"
								aria-label={$t('usersRoles.users.delete', { user: user.username })}
								title={$t('usersRoles.users.delete', { user: user.username })}
								onclick={() => onDelete(user)}
							>
								<Trash2Icon size={16} />
							</button>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="4" class="empty">{$t('usersRoles.users.noMatch')}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="footer">
		<InfoIcon size={14} />
		{$t('usersRoles.users.footer')}
	</p>
</div>

<style lang="scss">
	.card {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: var(--card);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		padding: 0.75rem 1rem;
		color: var(--muted-foreground);
		font-size: var(--font-size-xs);
		font-weight: 600;
		letter-spacing: 0.05em;
		text-align: left;
		text-transform: uppercase;
	}

	td {
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border);
		vertical-align: middle;
	}

	.actions {
		width: 3rem;
		text-align: right;
	}

	.empty {
		color: var(--muted-foreground);
		text-align: center;
	}

	.user {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.user-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.sub {
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	.badge {
		padding: 0 0.5rem;
		border-radius: 99px;
		font-size: var(--font-size-xs);
		font-weight: 600;
		line-height: 1.5;

		&.super {
			background: var(--admin-badge-background);
			color: white;
			text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
		}

		&.outline {
			border: 1px solid var(--border);
		}
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.25rem 0.125rem 0.625rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
		font-size: var(--font-size-sm);

		button {
			display: inline-flex;
			padding: 0.125rem;
			border: 0;
			border-radius: 50%;
			background: transparent;
			color: inherit;
			cursor: pointer;

			&:hover {
				background: color-mix(in srgb, var(--primary) 20%, transparent);
			}
		}
	}

	.trash {
		display: inline-flex;
		padding: 0.375rem;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		color: var(--destructive);
		cursor: pointer;

		&:hover {
			background: color-mix(in srgb, var(--destructive) 12%, transparent);
		}
	}

	.footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0.625rem 1rem;
		border-top: 1px solid var(--border);
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	// A class passed to a DropdownMenu part gets no scope class.
	.chips :global(.add-role) {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.625rem;
		border: 1px dashed var(--border);
		border-radius: 0.375rem;
		background: transparent;
		color: var(--primary);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	// The menu renders in a portal, outside `.chips`, so its root name must be unique.
	:global(.users-roles-add-role-menu) {
		min-width: 14rem;
		padding: 0.5rem;

		:global(.add-role-label) {
			padding: 0.5rem 0.5rem 0.25rem;
			color: var(--muted-foreground);
			font-size: var(--font-size-xs);
			font-weight: 600;
			letter-spacing: 0.05em;
			text-transform: uppercase;
		}

		:global(.add-role-item) {
			gap: 0.75rem;
			padding: 0.5rem;
		}

		.role-name {
			flex: 1 1 auto;
		}
	}
</style>
