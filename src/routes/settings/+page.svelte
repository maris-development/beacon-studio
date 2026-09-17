<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import SettingField from '@/components/settings/SettingField.svelte';
	import { addToast } from '@/stores/toasts';
	import {
		resetSettings,
		SETTING_DEFINITIONS,
		type SettingDefinition,
		type SettingGroup
	} from '@/stores/settings';

	/** The definitions per group, in the order of the definition list. */
	const groups: Array<{ name: SettingGroup; fields: SettingDefinition[] }> = (() => {
		const result: Array<{ name: SettingGroup; fields: SettingDefinition[] }> = [];

		for (const definition of SETTING_DEFINITIONS) {
			let group = result.find((entry) => entry.name === definition.group);
			if (!group) {
				group = { name: definition.group, fields: [] };
				result.push(group);
			}
			group.fields.push(definition);
		}

		return result;
	})();

	/** True while the confirmation of the reset is open. */
	let isConfirmOpen = $state(false);

	function onResetAll(): void {
		isConfirmOpen = false;
		resetSettings();
		addToast({ type: 'success', message: 'All settings are back to their defaults.' });
	}
</script>

<svelte:head>
	<title>Settings - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Settings', href: '/settings' }]} />

<div class="page-wrapper">
	<div class="page-container">
		<h1>Settings</h1>

		<p>
			Manage your Beacon Studio settings here. The app keeps every value in this browser. A change
			applies to the next query, map or refresh.
		</p>

		<div class="settings-groups">
			{#each groups as group (group.name)}
				<Card>
					<h3>{group.name}</h3>
					<div class="fields">
						{#each group.fields as definition (definition.key)}
							<SettingField {definition} />
						{/each}
					</div>
				</Card>
			{/each}
		</div>

		<div class="actions">
			<Button variant="outline" onclick={() => (isConfirmOpen = true)}>Reset all settings</Button>
		</div>
	</div>
</div>

{#if isConfirmOpen}
	<Modal title="Reset all settings" onClose={() => (isConfirmOpen = false)} width="440px">
		<p>
			This puts every setting of this browser back to its default. The app loses your query limits,
			your cache size, your map defaults and your telemetry choice.
		</p>
		<p>You cannot undo this.</p>

		<div slot="footer" class="confirm-actions">
			<Button variant="outline" onclick={() => (isConfirmOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={onResetAll}>Reset all settings</Button>
		</div>
	</Modal>
{/if}

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
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
