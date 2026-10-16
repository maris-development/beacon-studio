import { beforeEach, describe, expect, it } from 'vitest';
import { SETTING_DEFINITIONS, getSettings, setSetting } from '../settings';

describe('adminFeatures setting', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('is on by default', () => {
		expect(getSettings().adminFeatures).toBe(true);
	});

	it('stores a new value', () => {
		setSetting('adminFeatures', false);
		expect(getSettings().adminFeatures).toBe(false);
		setSetting('adminFeatures', true);
	});

	it('has a definition in the System group', () => {
		const definition = SETTING_DEFINITIONS.find((d) => d.key === 'adminFeatures');
		expect(definition).toMatchObject({
			group: 'system',
			type: 'boolean'
		});
	});
});
