<!--
	Wraps one in-page admin control. While admin features are off, the control
	is disabled and the wrapper shows a hint.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '@/i18n';
	import { settings } from '@/stores/settings';

	let { children }: { children: Snippet<[{ disabled: boolean }]> } = $props();

	let disabled = $derived(!$settings.adminFeatures);
</script>

<!-- A disabled button gets no hover events, so the wrapper holds the hint. -->
<span class="admin-action" title={disabled ? $t('admin.offHint') : undefined}>
	{@render children({ disabled })}
</span>

<style lang="scss">
	.admin-action {
		display: inline-flex;
	}
</style>
