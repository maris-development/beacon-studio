<script lang="ts">
    import * as Select from '$lib/components/ui/select/index.js';
    import { BeaconClient } from '@/beacon-api/client';
    import { defaultOutputFormat } from '@/query/draft';

    let {
        selected_output_format = $bindable(defaultOutputFormat())
    }: {
        /** The output format of the query. The values match `BeaconClient.output_formats`. */
        selected_output_format?: string;
    } = $props();
</script>

<h3>Output Format</h3>

<Select.Root type="single" name="outputFormat" bind:value={selected_output_format}>
    <Select.Trigger class="output-format-trigger">
        {selected_output_format}
    </Select.Trigger>
    <Select.Content>
        <Select.Group>
            <Select.Label>Tables</Select.Label>
            {#each Object.entries(BeaconClient.output_formats) as [label, value], index (index)}
                <Select.Item {label} {value} />
            {/each}
        </Select.Group>
    </Select.Content>
</Select.Root>

<style lang="scss">
    h3 {
        margin: 0 0 1rem;
    }

    :global(.output-format-trigger) {
        width: 180px;
    }
</style>
