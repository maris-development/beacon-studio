<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import SettingField from '@/components/settings/SettingField.svelte';
	import { TELEMETRY_BUILD_ENABLED } from '@/build-info';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { t, translate } from '@/i18n';
	import {
		resetSettings,
		VISIBLE_SETTING_DEFINITIONS,
		type SettingDefinition,
		type SettingGroup
	} from '@/stores/settings';

	/** The definitions per group, in the order of the definition list. */
	const groups: Array<{ name: SettingGroup; fields: SettingDefinition[] }> = (() => {
		const result: Array<{ name: SettingGroup; fields: SettingDefinition[] }> = [];

		for (const definition of VISIBLE_SETTING_DEFINITIONS) {
			let group = result.find((entry) => entry.name === definition.group);
			if (!group) {
				group = { name: definition.group, fields: [] };
				result.push(group);
			}
			group.fields.push(definition);
		}

		return result;
	})();

	async function onResetAll(): Promise<void> {
		let message = translate('settings.resetAllMessage');
		if (TELEMETRY_BUILD_ENABLED) {
			message = translate('settings.resetAllMessageTelemetry');
		}

		const goAhead = await askConfirm({
			title: translate('settings.resetAll'),
			message,
			note: translate('settings.resetAllNote'),
			confirmLabel: translate('settings.resetAll'),
			destructive: true
		});

		if (!goAhead) return;

		resetSettings();
		addToast({ type: 'success', key: 'settings.resetAllDone' });
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('settings.title') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('settings.title'), href: '/settings' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('settings.title')}</h1>

		<p>{$t('settings.intro')}</p>

		<div class="settings-groups">
			{#each groups as group (group.name)}
				<Card>
					<h3>{$t(`settings.group.${group.name}`)}</h3>
					<div class="fields">
						{#each group.fields as definition (definition.key)}
							<SettingField {definition} />
						{/each}
					</div>
				</Card>
			{/each}
		</div>

		<div class="actions">
			<Button variant="outline" onclick={onResetAll}>{$t('settings.resetAll')}</Button>
		</div>

		{#if !TELEMETRY_BUILD_ENABLED}
			<p class="build-note">{$t('settings.noTelemetryBuild')}</p>
		{/if}
	</div>
</div>

<style lang="scss">
	.page-container {
		.settings-groups {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			margin-top: 1rem;

			h3 {
				margin: 0;
			}

			.fields {
				display: flex;
				flex-direction: column;

				// The rule crosses a component boundary, so it needs `:global`.
				:global(.setting-field + .setting-field) {
					border-top: 1px solid var(--border);
				}
			}
		}

		.actions {
			display: flex;
			justify-content: flex-end;
			margin: 1rem 0 2rem;
		}

		.build-note {
			margin: 0 0 2rem;
			font-size: var(--font-size-sm);
			color: var(--muted-foreground);
			text-align: center;
		}
	}
</style>
