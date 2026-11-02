<!-- A search field with a search icon at the start. -->
<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import { Input } from "@/components/ui/input";

    let {
        value = $bindable(""),
        placeholder,
        onchange
    }: { value?: string; placeholder: string; onchange?: () => void } = $props();
</script>

<div class="search-input">
    <SearchIcon size={16} />
    <Input type="search" {placeholder} bind:value {onchange} />
</div>

<style lang="scss">
    .search-input {
        position: relative;
        width: 100%;
        max-width: 20rem;

        :global(svg) {
            position: absolute;
            top: 50%;
            left: 0.75rem;
            transform: translateY(-50%);
            color: var(--muted-foreground);
            pointer-events: none;
        }

        :global(input) {
            padding-left: 2.25rem;
        }
    }
</style>
