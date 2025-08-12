<script lang="ts">
	import { ApacheArrowUtils } from '@/arrow-utils';
	import * as ApacheArrow from 'apache-arrow';
	import { onMount } from 'svelte';

    let {
        data,
        table,
        latitudeColumnName,
        longitudeColumnName,
        groupByDecimals = 3 // Default to 3 decimals for grouping
    }: {
        data: unknown[], 
        table: ApacheArrow.Table,
        latitudeColumnName: string,
        longitudeColumnName: string,
        groupByDecimals?: number 
    } = $props();

    const record: Record<string, unknown> = ApacheArrowUtils.arrayToRecord(data, table.schema);

    onMount(() => {
        console.log('onMount MapPopupContent', record);
        
    });

</script>

<div class="map-popup-content">
    <h3>Data Record</h3>
    {#each Object.entries(record) as [key, value]}
        <div class="field">
            <span class="field-name">{key}:</span>
            <span class="field-value">{value}</span>
        </div>
    {/each}
</div>

<style lang="scss">
    .map-popup-content {
    
        .field {
            margin-bottom: 0.5rem;

            .field-name {
                font-weight: bold;
            }

            .field-value {
                color: #333;
            }
        }
    }
</style>
