<!--
	The name of one plot option, with an info button that describes the option on hover.
-->
<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.js";
    import { InfoTip } from "$lib/components/ui/info-tip/index.js";
    import { t } from "@/i18n";

    let {
        text,
        info,
        for: target = undefined,
        id = undefined
    }: {
        text: string;
        info: string;
        /** The id of the control. Without it the name is plain text, for a group or a fixed value. */
        for?: string;
        /** The id of the name, for `aria-labelledby` on a group. */
        id?: string;
    } = $props();
</script>

<span class="option-label">
    {#if target}
        <Label for={target} {id}>{text}</Label>
    {:else}
        <span {id}>{text}</span>
    {/if}
    <InfoTip label={$t("plot.panel.about", { option: text })} text={info} />
</span>

<style lang="scss">
    .option-label {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        min-width: 0;
        font-size: var(--font-size-sm);
        font-weight: 500;
    }
</style>
