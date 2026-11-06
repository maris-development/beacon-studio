<script lang="ts">
    // The sidebar entry that picks the theme. It writes the same setting as the settings page.
    import MonitorIcon from "@lucide/svelte/icons/monitor";
    import MoonIcon from "@lucide/svelte/icons/moon";
    import SunIcon from "@lucide/svelte/icons/sun";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import { t } from "@/i18n";
    import { setSetting, settings, THEME_SETTINGS, type ThemeSetting } from "@/stores/settings";
    import SidebarMenuItem from "./SidebarMenuItem.svelte";

    let { compact = false, open = $bindable(false) }: { compact?: boolean; open?: boolean } =
        $props();

    const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };

    // An unknown stored value follows the OS, so the menu shows it as System.
    const current: ThemeSetting = $derived.by(() => {
        const value = $settings.theme;
        if (value === "light" || value === "dark") return value;
        return "system";
    });
</script>

<DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger>
        {#snippet child({ props })}
            <SidebarMenuItem
                title={$t("theme.menu", { theme: $t(`theme.${current}`) })}
                icon={ICONS[current]}
                buttonProps={props}
                {compact}
            />
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content side="right" align="end" class="w-56">
        <DropdownMenu.RadioGroup
            value={current}
            onValueChange={(value) => setSetting("theme", value)}
        >
            {#each THEME_SETTINGS as value (value)}
                <DropdownMenu.RadioItem {value}>{$t(`theme.${value}`)}</DropdownMenu.RadioItem>
            {/each}
        </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
</DropdownMenu.Root>
