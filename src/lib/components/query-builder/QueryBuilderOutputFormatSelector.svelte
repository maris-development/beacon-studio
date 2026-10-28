<script lang="ts">
    import * as Select from "$lib/components/ui/select/index.js";
    import { BeaconClient } from "@/beacon-api/client";
    import { defaultOutputFormat } from "@/query/draft";
    import QueryBuilderStep from "./QueryBuilderStep.svelte";
    import { t } from "@/i18n";

    let {
        step,
        disabled = false,
        done = false,
        selected_output_format = $bindable(defaultOutputFormat())
    }: {
        /** The number of this step in the builder. */
        step: number;
        /** True while the query has no column. The select keeps its value. */
        disabled?: boolean;
        /** True when the step is complete. See QueryBuilderStep. */
        done?: boolean;
        /** The output format of the query. The values match `BeaconClient.output_formats`. */
        selected_output_format?: string;
    } = $props();
</script>

<QueryBuilderStep
    {step}
    {done}
    title={$t("query.outputFormat.title")}
    description={$t("query.outputFormat.description")}
>
    <Select.Root type="single" name="outputFormat" {disabled} bind:value={selected_output_format}>
        <Select.Trigger class="output-format-trigger">
            {selected_output_format}
        </Select.Trigger>
        <Select.Content>
            <Select.Group>
                <Select.Label>{$t("query.outputFormat.listLabel")}</Select.Label>
                {#each Object.entries(BeaconClient.output_formats) as [label, value], index (index)}
                    <Select.Item {label} {value} />
                {/each}
            </Select.Group>
        </Select.Content>
    </Select.Root>
</QueryBuilderStep>

<style lang="scss">
    :global(.output-format-trigger) {
        width: 180px;
    }
</style>
