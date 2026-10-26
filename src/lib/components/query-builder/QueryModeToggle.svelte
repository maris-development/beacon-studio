<!--
	The Builder | SQL switch of a query. The parent asks the workspace, and the workspace can ask the user.
-->
<script lang="ts">
    import BlocksIcon from "@lucide/svelte/icons/blocks";
    import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";
    import Button from "../buttons/Button.svelte";
    import type { QueryMode } from "@/stores/stored-query";
    import { t, type MessageKey } from "@/i18n";

    let {
        mode,
        onSelect
    }: {
        mode: QueryMode;
        onSelect: (mode: QueryMode) => void;
    } = $props();

    const MODES: { id: QueryMode; label: MessageKey; icon: typeof BlocksIcon }[] = [
        { id: "builder", label: "workbench.mode.builder", icon: BlocksIcon },
        { id: "sql", label: "workbench.mode.sql", icon: SquareTerminalIcon }
    ];
</script>

<div class="mode-toggle" role="group" aria-label={$t("workbench.mode.label")}>
    {#each MODES as option (option.id)}
        <Button
            size="sm"
            variant={option.id === mode ? "default" : "outline"}
            aria-pressed={option.id === mode}
            onclick={() => onSelect(option.id)}
        >
            <option.icon />
            {$t(option.label)}
        </Button>
    {/each}
</div>

<style lang="scss">
    .mode-toggle {
        display: inline-flex;
        flex-shrink: 0;
        gap: 0.25rem;
    }
</style>
