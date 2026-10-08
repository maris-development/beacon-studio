<script lang="ts">
	// The sidebar entry that picks the language. It writes the same setting as the settings page.
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { AUTO_LANGUAGE, SUPPORTED_LOCALES, t } from '@/i18n';
	import { setSetting, settings } from '@/stores/settings';
	import SidebarMenuItem from './SidebarMenuItem.svelte';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<SidebarMenuItem title={$t('language.menu')} icon={LanguagesIcon} buttonProps={props} />
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content side="right" align="end" class="w-56">
		<DropdownMenu.RadioGroup
			value={$settings.language}
			onValueChange={(value) => setSetting('language', value)}
		>
			<DropdownMenu.RadioItem value={AUTO_LANGUAGE}>{$t('language.auto')}</DropdownMenu.RadioItem>
			{#each SUPPORTED_LOCALES as entry (entry.code)}
				<DropdownMenu.RadioItem value={entry.code} lang={entry.code}>
					{entry.name}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
