<script lang="ts">
	import type { AuthUser } from '@maris-development/beacon-client';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import { initials } from '@/access/summary';

	let { user }: { user: AuthUser } = $props();
</script>

{#if user.is_super_user}
	<span class="avatar super"><ShieldIcon size={18} /></span>
{:else if user.is_anonymous}
	<span class="avatar anonymous"><GlobeIcon size={18} /></span>
{:else}
	<span class="avatar local">{initials(user.username)}</span>
{/if}

<style lang="scss">
	.avatar {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		font-size: var(--font-size-sm);
		font-weight: 600;

		&.super {
			background: var(--admin-badge-background);
			color: white;
		}

		&.anonymous {
			background: var(--muted);
			color: var(--muted-foreground);
		}

		&.local {
			background: color-mix(in srgb, #7c3aed 14%, transparent);
			color: #6d28d9;
		}
	}
</style>
