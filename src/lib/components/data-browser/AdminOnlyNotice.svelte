<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '@/i18n';
</script>

<p class="notice">
	{$t('admin.onlyNotice.beforeLink')}
	<a href={resolve('/settings')}>{$t('nav.item.settings')}</a>{$t('admin.onlyNotice.afterLink')}
</p>

<style lang="scss">
	.notice {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		color: var(--muted-foreground);
	}
</style>
