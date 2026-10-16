<!-- Marks a Beacon node with an admin session. -->
<script lang="ts">
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { t } from '@/i18n';
</script>

<span class="admin-badge">
	<!-- The classes opt out of the muted icon colour and size of a dropdown item. -->
	<ShieldCheckIcon class="text-current size-3.5" />
	{$t('admin.badge')}
</span>

<style lang="scss">
	.admin-badge {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.625rem;
		border-radius: 99px;
		background: var(--admin-badge-background);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 700;
		line-height: 1.4;
		// The middle of the gradient is light, so white text needs a shadow.
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
	}
</style>
