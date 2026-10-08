import { beforeEach, describe, expect, it } from 'vitest';
import { SETTING_DEFINITIONS, getSettings, setSetting } from '../settings';

describe('adminFeatures setting', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('is off by default', () => {
		expect(getSettings().adminFeatures).toBe(false);
	});

	it('stores a new value', () => {
		setSetting('adminFeatures', true);
		expect(getSettings().adminFeatures).toBe(true);
		setSetting('adminFeatures', false);
	});

	it('has a definition in the System group', () => {
		const definition = SETTING_DEFINITIONS.find((d) => d.key === 'adminFeatures');
		expect(definition).toMatchObject({
			group: 'system',
			type: 'boolean'
		});
	});
});
