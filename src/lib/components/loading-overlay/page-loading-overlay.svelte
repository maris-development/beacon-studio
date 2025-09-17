<script lang="ts">
	import LoadingSpinner from '@/components/loading-overlay/loading-spinner.svelte';

    let {
        text = 'Loading...',
		ringColor = undefined,
		size = undefined
	}: {
        text?: string,
		ringColor?: string,
		size?: string
	} = $props();

</script>

<div class="page-loading-overlay">
    <LoadingSpinner
        {ringColor}
        {size}
    ></LoadingSpinner>
    <span>{text}</span>
</div>


<style lang="scss">
    /* your styles go here */
    .page-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 100000; /* Ensure it's above other content */
        gap: 1rem;

        span {
            font-size: 1.2rem;
            color: #333;
        }
    }
</style>