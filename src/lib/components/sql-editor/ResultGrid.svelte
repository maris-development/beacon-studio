<script lang="ts">
    import type * as ApacheArrow from "apache-arrow";
    import DataTable from "@/components/visualisation/DataTable.svelte";
    import { ApacheArrowUtils } from "@/arrow-utils";
    import { PREVIEW_ROW_LIMIT } from "@/sql/run";
    import type { Column } from "@/util-types";

    let {
        columns,
        types = [],
        rows,
        loading = false,
        numbered = false
    }: {
        columns: string[];
        types?: unknown[];
        rows: Record<string, unknown>[];
        loading?: boolean;
        /** Add a first column with the number of each row. */
        numbered?: boolean;
    } = $props();

    // A key that no result column can have.
    const NUMBER_KEY = "\u0000#";

    let tableColumns: Column[] = $derived.by(() => {
        const result = columns.map((key) => ({ key, header: key, sortable: false }));
        if (numbered) result.unshift({ key: NUMBER_KEY, header: "#", sortable: false });

        return result;
    });

    let textRows = $derived(
        rows.map((row, rowIndex) => {
            const text: Record<string, string | null> = {};
            if (numbered) text[NUMBER_KEY] = String(rowIndex + 1);

            columns.forEach((key, index) => {
                const value = row[key];
                if (value === null || value === undefined) {
                    text[key] = null;
                } else {
                    text[key] = ApacheArrowUtils.typedValueToString(
                        value,
                        types[index] as ApacheArrow.DataType
                    );
                }
            });
            return text;
        })
    );
</script>

<!-- The preview holds at most PREVIEW_ROW_LIMIT rows, so one page shows all of them. -->
<DataTable
    columns={tableColumns}
    rows={textRows}
    totalRows={rows.length}
    pageSize={PREVIEW_ROW_LIMIT}
    isLoading={loading}
    pagination={false}
    size="small"
/>
