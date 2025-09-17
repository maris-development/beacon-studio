<script lang="ts">

	let {
		ringColor = "black",
		size = "32px",
	}: {
		ringColor?: string ;
		size?: string ;
	} = $props();
</script>

<div class="loading-spinner-wrapper">
	<div
		class="loading-spinner"
		style="--ring-color: {ringColor};  --size: {size}"
	></div>
</div>

<style lang="scss">
	.loading-spinner-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		.loading-spinner {
			width: var(--size, 32px);
			height: var(--size, 32px);
			border: 4px solid;
			border-color: var(--ring-color, #000) transparent;
			border-top-color: var(--ring-color, #000);
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
