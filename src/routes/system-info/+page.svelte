<script lang="ts">
	import { BeaconClient } from '@/beacon-api/client';

	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import Card from '@/components/card/card.svelte';
	import { onMount } from 'svelte';
	import type { BeaconSystemInfo } from '@/beacon-api/types';
	import { Utils } from '@/utils';

	const UPDATE_INTERVAL = 1000; // 5 seconds

	let currentBeaconInstanceValue: BeaconInstance | null = null;
	let client: BeaconClient;
	let systemInfo: BeaconSystemInfo | undefined = $state(undefined);

	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;

		if (!currentBeaconInstanceValue) {
			alert('No Beacon instance selected. Please select one before proceeding.');
		}

		client = BeaconClient.new(currentBeaconInstanceValue);

		const updateInterval = setInterval(async () => {
			await updateSystemInfo();
		}, UPDATE_INTERVAL);

		updateSystemInfo();

		return () => {
			clearInterval(updateInterval);
		};
	});

	async function updateSystemInfo() {
		try {
			systemInfo = await client.getSystemInfo();

			// systemInfo = {
			// 	beacon_version : '1.0.0',
			// 	system_info: null
			// }
		} catch (error) {
			console.error('Error fetching Beacon system info:', error);
		}
	}
</script>

<svelte:head>
	<title>System Information - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'System Info', href: '/system-info' }]} />

<div class="page-container">
	<h1>System Information</h1>

	<p>
		View detailed information about the Beacon Studio system, including version, CPU usage, memory,
		and more.
	</p>

	{#if systemInfo && systemInfo.system_info == null}
		<p class="bold">
			No system information available, enable system information by setting the
			BEACON_ENABLE_SYS_INFO environment variable.
		</p>
	{/if}

	<div class="system-info-flex">
		<div class="system-info-grid">
			<Card>
				<span class="description muted">Beacon Version</span>
				<div class="title">{systemInfo?.beacon_version}</div>
				{#if systemInfo?.system_info != null}
					<div>
						System uptime: {Utils.formatSecondsToReadableTime(systemInfo.system_info.uptime)}
					</div>
				{/if}
			</Card>

			{#if systemInfo?.system_info != null}
				<Card>
					<span class="description muted">System CPU Usage</span>
					<div class="title">{(systemInfo.system_info.global_cpu_usage * 100).toFixed(1)}%</div>

					<div class="muted">
						{systemInfo.system_info.physical_core_count} Physical Cores
					</div>
				</Card>

				<Card>
					<span class="description muted">System Memory Usage</span>
					<div class="title">{Utils.formatBytes(systemInfo.system_info.used_memory)}</div>

					<div>{Utils.formatBytes(systemInfo.system_info.total_memory)} Total</div>
					<div class="muted">
						{(
							(systemInfo.system_info.used_memory / systemInfo.system_info.total_memory) *
							100
						).toFixed(1)}% Used
					</div>
					<div class="muted">
						{Utils.formatBytes(systemInfo.system_info.free_memory)} Free
					</div>
				</Card>

				<Card>
					<span class="description muted">System Swap Usage</span>
					<div class="title">{Utils.formatBytes(systemInfo.system_info.used_swap)}</div>

					<div>{Utils.formatBytes(systemInfo.system_info.total_swap)} Total</div>
					<div class="muted">
						{((systemInfo.system_info.used_swap / systemInfo.system_info.total_swap) * 100).toFixed(
							1
						)}% Used
					</div>
					<div class="muted">
						{Utils.formatBytes(systemInfo.system_info.free_swap)} Free
					</div>
				</Card>

				<Card>
					<span class="muted">Load Average</span>

					<div class="title">
						1 min:
						{(
							(systemInfo.system_info.load_average.one /
								systemInfo.system_info.physical_core_count) *
							100
						).toFixed(1)}%
					</div>
					<div class="title">
						5 min:
						{(
							(systemInfo.system_info.load_average.five /
								systemInfo.system_info.physical_core_count) *
							100
						).toFixed(1)}%
					</div>
					<div class="title">
						15 min:
						{(
							(systemInfo.system_info.load_average.fifteen /
								systemInfo.system_info.physical_core_count) *
							100
						).toFixed(1)}%
					</div>
				</Card>

				<Card>
					<span class="muted">System Information</span>
					<div class="title">{systemInfo.system_info.name}</div>
					<div>OS: {systemInfo.system_info.long_os_version}</div>
					<div class="muted">Hostname: {systemInfo.system_info.host_name}</div>
					<div class="muted">Kernel: {systemInfo.system_info.kernel_version}</div>
					<div class="muted">Distribution: {systemInfo.system_info.distribution_id}</div>
					<div class="muted">Version: {systemInfo.system_info.os_version}</div>
				</Card>

				<Card>
					<span class="muted">CPUs</span>

					<div class="title">
						{systemInfo.system_info.cpus.length}× {systemInfo.system_info.cpus[0].brand}
					</div>
				</Card>
			{/if}
		</div>
	</div>
</div>

<style lang="scss">
	.page-container {
		--gap: 1rem;
		.muted {
			color: var(--muted-foreground);
			font-weight: normal;
		}

		.bold {
			font-weight: bold;
			color: var(--foreground);
		}

		.system-info-flex {
			display: flex;
			flex-direction: column;
			gap: var(--gap);
			.system-info-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
				gap: var(--gap);

				.description.muted {
					font-size: 0.8rem;
				}

				div.title {
					font-weight: var(--font-weight-semibold);
					font-size: 1.4rem;
				}
			}
		}
	}
</style>
