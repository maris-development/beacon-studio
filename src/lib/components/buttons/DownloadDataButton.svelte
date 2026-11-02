<script lang="ts">
    import Button, { type ButtonVariant } from "$lib/components/buttons/Button.svelte";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import LoadingIcon from "@lucide/svelte/icons/loader-2";
    import { t } from "@/i18n";

    let {
        downloadData,
        disabled = false,
        title = "",
        variant = "default"
    }: {
        downloadData: () => void | Promise<void>;
        disabled?: boolean;
        title?: string;
        variant?: ButtonVariant;
    } = $props();

    let isLoading = $state(false);

    async function handleDownloadData() {
        if (isLoading || disabled) return;
        isLoading = true;
        try {
            await downloadData();
        } finally {
            isLoading = false;
        }
    }
</script>

<!-- `action-label` lets a narrow action bar hide the text. -->
<Button onclick={handleDownloadData} disabled={isLoading || disabled} {title} {variant}>
    {#if isLoading}
        <LoadingIcon class="animate-spin" />
        <span class="action-label">{$t("download.loading")}</span>
    {:else}
        <DownloadIcon />
        <span class="action-label">{$t("download.button")}</span>
    {/if}
</Button>
