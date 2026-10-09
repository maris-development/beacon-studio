<script lang="ts">
	import { BeaconClient } from '@/beacon-api/client';

	import { currentNode } from '@/services/beacon-node';
	import type { BeaconNode } from '@/beacon-api/types';
	import { settings } from '@/stores/settings';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import { onMount } from 'svelte';
	import type { BeaconSystemInfo } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import { askAlert } from '@/stores/confirm';
	import { t, translate, formatNumber } from '@/i18n';

	let currentNodeValue: BeaconNode | null = null;
	let client: BeaconClient;
	let systemInfo: BeaconSystemInfo | undefined = $state(undefined);
	let ready = $state(false);

	onMount(() => {
		currentNodeValue = $currentNode;

		if (!currentNodeValue) {
			void askAlert({
				title: translate('system.noNode.title'),
				message: translate('system.noNode.message')
			});

			return;
		}

		client = BeaconClient.new(currentNodeValue);
		ready = true;
	});

	// The user sets the period on the settings page. A new value restarts the timer.
	$effect(() => {
		if (!ready) return;

		const period = $settings.systemInfoUpdateIntervalMs;
		const updateInterval = setInterval(async () => {
			await updateSystemInfo();
		}, period);

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

	function percent(fraction: number): string {
		return $formatNumber(fraction, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('system.title') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('nav.item.systemInfo'), href: '/system-info' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('system.title')}</h1>

		<p>
			{$t('system.intro')}
		</p>

		{#if systemInfo && systemInfo.system_info == null}
			<p class="bold">
				{$t('system.disabled', { variable: 'BEACON_ENABLE_SYS_INFO' })}
			</p>
		{/if}

		<div class="system-info-flex">
			<div class="system-info-grid">
				<Card>
					<span class="description muted">{$t('system.version')}</span>
					<div class="title">{systemInfo?.beacon_version}</div>
					{#if systemInfo?.system_info != null}
						<div>
							{$t('system.uptime', { time: Utils.formatSecondsToReadableTime(systemInfo.system_info.uptime) })}
						</div>
					{/if}
				</Card>

				{#if systemInfo?.system_info != null}
					<Card>
						<span class="description muted">{$t('system.cpu.title')}</span>
						<div class="title">{percent(systemInfo.system_info.global_cpu_usage)}</div>

						<div class="muted">
							{$t('system.cpu.cores', { count: systemInfo.system_info.physical_core_count })}
						</div>
					</Card>

					<Card>
						<span class="description muted">{$t('system.memory.title')}</span>
						<div class="title">{Utils.formatBytes(systemInfo.system_info.used_memory)}</div>

						<div>{$t('system.total', { size: Utils.formatBytes(systemInfo.system_info.total_memory) })}</div>
						<div class="muted">
							{$t('system.used', {
								percent: percent(systemInfo.system_info.used_memory / systemInfo.system_info.total_memory)
							})}
						</div>
						<div class="muted">
							{$t('system.free', { size: Utils.formatBytes(systemInfo.system_info.free_memory) })}
						</div>
					</Card>

					<Card>
						<span class="description muted">{$t('system.swap.title')}</span>
						<div class="title">{Utils.formatBytes(systemInfo.system_info.used_swap)}</div>

						<div>{$t('system.total', { size: Utils.formatBytes(systemInfo.system_info.total_swap) })}</div>
						<div class="muted">
							{$t('system.used', {
								percent: percent(systemInfo.system_info.used_swap / systemInfo.system_info.total_swap)
							})}
						</div>
						<div class="muted">
							{$t('system.free', { size: Utils.formatBytes(systemInfo.system_info.free_swap) })}
						</div>
					</Card>

					<Card>
						<span class="muted">{$t('system.load.title')}</span>

						<div class="title">
							{$t('system.load.one', {
								percent: percent(
									systemInfo.system_info.load_average.one / systemInfo.system_info.physical_core_count
								)
							})}
						</div>
						<div class="title">
							{$t('system.load.five', {
								percent: percent(
									systemInfo.system_info.load_average.five / systemInfo.system_info.physical_core_count
								)
							})}
						</div>
						<div class="title">
							{$t('system.load.fifteen', {
								percent: percent(
									systemInfo.system_info.load_average.fifteen / systemInfo.system_info.physical_core_count
								)
							})}
						</div>
					</Card>

					<Card>
						<span class="muted">{$t('system.os.title')}</span>
						<div class="title">{systemInfo.system_info.name}</div>
						<div>{$t('system.os.os', { value: systemInfo.system_info.long_os_version })}</div>
						<div class="muted">{$t('system.os.hostname', { value: systemInfo.system_info.host_name })}</div>
						<div class="muted">{$t('system.os.kernel', { value: systemInfo.system_info.kernel_version })}</div>
						<div class="muted">{$t('system.os.distribution', { value: systemInfo.system_info.distribution_id })}</div>
						<div class="muted">{$t('system.os.version', { value: systemInfo.system_info.os_version })}</div>
					</Card>

					<Card>
						<span class="muted">{$t('system.cpus.title')}</span>

						<div class="title">
							{$t('system.cpus.count', {
								count: systemInfo.system_info.cpus.length,
								brand: systemInfo.system_info.cpus[0].brand
							})}
						</div>
					</Card>
				{/if}
			</div>
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
