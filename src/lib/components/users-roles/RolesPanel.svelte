<script lang="ts">
	import type {
		AuthRole,
		AuthRule,
		AuthUser,
		PrivilegeTarget
	} from '@maris-development/beacon-client';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import ShieldOffIcon from '@lucide/svelte/icons/shield-off';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import XIcon from '@lucide/svelte/icons/x';
	import Button from '@/components/buttons/Button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { t } from '@/i18n';
	import {
		describeTarget,
		filterRoles,
		membersOf,
		ruleCount,
		targetOf,
		usersToAdd
	} from '@/access/summary';
	import UserAvatar from './UserAvatar.svelte';

	let {
		roles,
		users,
		needle,
		selected,
		onSelect,
		onNewRole,
		onAddRule,
		onRemoveRule,
		onAddMember,
		onRemoveMember,
		onDelete
	}: {
		roles: AuthRole[];
		users: AuthUser[];
		needle: string;
		selected: string | null;
		onSelect: (role: string) => void;
		onNewRole: () => void;
		onAddRule: (role: string) => void;
		onRemoveRule: (role: string, target: PrivilegeTarget, deny: boolean) => void;
		onAddMember: (role: string, user: string) => void;
		onRemoveMember: (role: string, user: string) => void;
		onDelete: (role: AuthRole) => void;
	} = $props();

	// The SDK always sends SELECT, so every rule shows it.
	const privilege = 'SELECT';

	let list = $derived(filterRoles(roles, needle));
	let current = $derived(list.find((role) => role.name === selected) ?? list[0] ?? null);
	let members = $derived(current ? membersOf(current.name, users) : []);
	let addable = $derived(current ? usersToAdd(current.name, users) : []);
	let rules = $derived.by(() => {
		if (!current) return [];
		const grants = current.grants.map((rule) => ({ rule, deny: false }));
		const denies = current.denies.map((rule) => ({ rule, deny: true }));
		return [...grants, ...denies];
	});

	function userRoles(user: AuthUser): string | null {
		if (user.roles.length === 0) return null;
		return user.roles.join(', ');
	}

	function ruleKey(rule: AuthRule, deny: boolean): string {
		return `${deny}:${rule.target_type}:${rule.target_value ?? ''}`;
	}
</script>

<div class="panel">
	<div class="card list">
		{#each list as role (role.name)}
			<button
				type="button"
				class="role"
				class:active={current?.name === role.name}
				onclick={() => onSelect(role.name)}
			>
				<span class="tile solid"><ShieldIcon size={16} /></span>
				<span class="text">
					<strong>{role.name}</strong>
					<span class="sub">
						{$t('usersRoles.roles.counts', {
							rules: ruleCount(role),
							members: membersOf(role.name, users).length
						})}
					</span>
				</span>
			</button>
		{/each}
		<button type="button" class="new" onclick={onNewRole}>
			<PlusIcon size={16} />
			{$t('usersRoles.newRole')}
		</button>
	</div>

	{#if current}
		{@const role = current}
		<div class="card detail">
			<div class="head">
				<span class="tile soft"><ShieldIcon size={20} /></span>
				<span class="text">
					<strong class="title">{role.name}</strong>
					<span class="sub">
						{$t('usersRoles.roles.counts', { rules: ruleCount(role), members: members.length })}
					</span>
				</span>
				<div class="head-actions">
					<Button onclick={() => onAddRule(role.name)}>
						<PlusIcon />
						{$t('usersRoles.roles.addRule')}
					</Button>
					<button
						type="button"
						class="trash"
						aria-label={$t('usersRoles.roles.delete', { role: role.name })}
						title={$t('usersRoles.roles.delete', { role: role.name })}
						onclick={() => onDelete(role)}
					>
						<Trash2Icon size={16} />
					</button>
				</div>
			</div>

			<section>
				<h3 class="section-title">
					{$t('usersRoles.roles.rules')}
					<span class="hint">{$t('usersRoles.roles.rulesHint')}</span>
				</h3>
				{#if rules.length === 0}
					<div class="empty-box">
						<ShieldOffIcon size={18} />
						<span class="grow">{$t('usersRoles.roles.noRules')}</span>
						<Button variant="outline" onclick={() => onAddRule(role.name)}>
							<PlusIcon />
							{$t('usersRoles.roles.addFirstRule')}
						</Button>
					</div>
				{:else}
					<ul class="rules">
						{#each rules as { rule, deny } (ruleKey(rule, deny))}
							<li class="rule">
								<span class="badge" class:deny>
									{#if deny}
										{$t('usersRoles.roles.deny')}
									{:else}
										{$t('usersRoles.roles.grant')}
									{/if}
								</span>
								<span class="mono">{privilege}</span>
								<span class="mono grow">{$t(describeTarget(targetOf(rule)))}</span>
								<button
									type="button"
									class="remove"
									aria-label={$t('usersRoles.roles.removeRule')}
									title={$t('usersRoles.roles.removeRule')}
									onclick={() => onRemoveRule(role.name, targetOf(rule), deny)}
								>
									<XIcon size={16} />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section>
				<div class="members-head">
					<h3 class="section-title">{$t('usersRoles.roles.members')}</h3>
					<div class="member-menu-anchor">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger class="member-trigger">
								<UserPlusIcon size={16} />
								{$t('usersRoles.roles.addMember')}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="users-roles-member-menu">
								<DropdownMenu.Label class="member-label">
									{$t('usersRoles.roles.giveTo', { role: role.name })}
								</DropdownMenu.Label>
								{#each addable as user (user.username)}
									<DropdownMenu.Item
										class="member-item"
										onSelect={() => onAddMember(role.name, user.username)}
									>
										<UserAvatar {user} />
										<span class="member-name">{user.username}</span>
										<span class="sub">{userRoles(user) ?? $t('usersRoles.roles.noRole')}</span>
									</DropdownMenu.Item>
								{:else}
									<DropdownMenu.Item class="member-item" disabled>
										{$t('usersRoles.roles.nobodyToAdd')}
									</DropdownMenu.Item>
								{/each}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</div>
				{#if members.length === 0}
					<p class="sub">{$t('usersRoles.roles.noMembers')}</p>
				{:else}
					<ul class="members">
						{#each members as user (user.username)}
							<li class="member">
								<UserAvatar {user} />
								<strong class="grow">{user.username}</strong>
								<button
									type="button"
									class="remove"
									aria-label={$t('usersRoles.roles.removeMember', { user: user.username })}
									title={$t('usersRoles.roles.removeMember', { user: user.username })}
									onclick={() => onRemoveMember(role.name, user.username)}
								>
									<XIcon size={16} />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style lang="scss">
	.panel {
		display: grid;
		grid-template-columns: 18rem 1fr;
		gap: 1rem;
		align-items: start;

		@media (max-width: 767px) {
			grid-template-columns: 1fr;
		}
	}

	.card {
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: var(--card);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.375rem;
	}

	.role {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;

		&:hover,
		&.active {
			background: color-mix(in srgb, var(--primary) 10%, transparent);
		}
	}

	.new {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
		padding: 0.625rem 0.5rem 0.375rem;
		border: 0;
		border-top: 1px solid var(--border);
		background: transparent;
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
		cursor: pointer;

		&:hover {
			color: var(--foreground);
		}
	}

	.tile {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;

		&.solid {
			background: var(--primary);
			color: var(--primary-foreground);
		}

		&.soft {
			width: 2.75rem;
			height: 2.75rem;
			background: color-mix(in srgb, var(--primary) 12%, transparent);
			color: var(--primary);
		}
	}

	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.sub {
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	.grow {
		flex: 1 1 auto;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.title {
		font-size: var(--font-size-md);
	}

	.head-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	section {
		padding: 1rem;

		& + section {
			border-top: 1px solid var(--border);
		}
	}

	.section-title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
		margin: 0 0 0.75rem;
	}

	.hint {
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
		font-weight: 400;
	}

	.empty-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px dashed var(--border);
		border-radius: 0.5rem;
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	.rules,
	.members {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rule,
	.member {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.badge {
		min-width: 3.5rem;
		padding: 0 0.5rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--access-all) 15%, transparent);
		color: var(--access-all);
		font-size: var(--font-size-xs);
		font-weight: 600;
		line-height: 1.5;
		text-align: center;

		&.deny {
			background: color-mix(in srgb, var(--destructive) 12%, transparent);
			color: var(--destructive);
		}
	}

	.remove {
		display: inline-flex;
		padding: 0.25rem;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;

		&:hover {
			background: var(--muted);
			color: var(--foreground);
		}
	}

	.trash {
		display: inline-flex;
		padding: 0.5rem;
		border: 1px solid color-mix(in srgb, var(--destructive) 35%, transparent);
		border-radius: 0.375rem;
		background: transparent;
		color: var(--destructive);
		cursor: pointer;

		&:hover {
			background: color-mix(in srgb, var(--destructive) 12%, transparent);
		}
	}

	.members-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;

		.section-title {
			margin: 0;
		}
	}

	.member-menu-anchor :global(.member-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		background: var(--card);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	// The menu renders in a portal, so its root name must be unique.
	:global(.users-roles-member-menu) {
		min-width: 16rem;
		padding: 0.5rem;

		:global(.member-label) {
			padding: 0.5rem 0.5rem 0.25rem;
			color: var(--muted-foreground);
			font-size: var(--font-size-xs);
			font-weight: 600;
			letter-spacing: 0.05em;
			text-transform: uppercase;
		}

		:global(.member-item) {
			gap: 0.75rem;
			padding: 0.5rem;
		}

		:global(.member-name) {
			flex: 1 1 auto;
		}

		:global(.sub) {
			color: var(--muted-foreground);
			font-size: var(--font-size-sm);
		}
	}
</style>
