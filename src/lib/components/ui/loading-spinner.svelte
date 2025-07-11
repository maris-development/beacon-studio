<script lang="ts">
	export let ringColor: string | null = 'gray';
	export let ringSegmentColor: string | null = 'black';
	export let size: string | null = '4rem';
</script>

<div class="loading-spinner-wrapper">
	<div
		class="loading-spinner"
		style="--ring-color: {ringColor}; --ring-segment-color: {ringSegmentColor}; --size: {size}"
	></div>
</div>

<style lang="scss">
	.loading-spinner-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		.loading-spinner {
			width: var(--size, 8px);
			height: var(--size, 8px);
			border: 4px solid;
			border-color: var(--ring-color, #e5e7eb) transparent;
			border-top-color: var(--ring-segment-color, #000);
			border-radius: 50%;
			animation: spin 1s linear infinite;
		}
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>
