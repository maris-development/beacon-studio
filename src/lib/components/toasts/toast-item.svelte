<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import SuccessIcon from '@lucide/svelte/icons/check';
	import ErrorIcon from '@lucide/svelte/icons/circle-alert';
	import InfoIcon from '@lucide/svelte/icons/info';
	import CloseIcon from '@lucide/svelte/icons/x';
	import type { ToastType } from '@/stores/toasts';

	const dispatch = createEventDispatcher();

	export let type: ToastType;
	export let dismissible = true;
</script>

<article class={type} role="alert" transition:fade>
	<div class="icon">
		{#if type === 'success'}
			<SuccessIcon width="1.1rem" />
		{:else if type === 'error'}
			<ErrorIcon width="1.1rem" />
		{:else}
			<InfoIcon width="1.1rem" />
		{/if}
	</div>

	<div class="text">
		<slot />
	</div>

	{#if dismissible}
		<button class="close" on:click={() => dispatch('dismiss')}>
			<CloseIcon width="0.8em" />
		</button>
	{/if}
</article>

<style lang="scss">
	article {
		color: white;
		padding: 0.5rem;
		border-radius: 0.5rem;
		display: flex;
		  align-items: flex-start;
		margin: 0 auto;
		margin-bottom: 1rem;
		width: 40vw;
		min-width: 300px;
		gap: 0.5rem;
	}
	
	.error {
		background: IndianRed;
	}
	.success {
		background: MediumSeaGreen;
	}
	.info {
		background: SkyBlue;
	}

	.text {
		flex: 1;
	}
	.icon {
		font-size: 1.1rem;
	}
	button {
		color: white;
		background: transparent;
		border: 0 none;
		padding: 0;
		line-height: 1;
		font-size: 1.1rem;
	}
</style>
