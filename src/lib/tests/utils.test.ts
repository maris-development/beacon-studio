import { describe, expect, it } from 'vitest';
import { Utils } from '../utils';

describe('Utils.createId', () => {
	it('puts the prefix of the caller before a random UUID', () => {
		expect(Utils.createId('plot')).toMatch(/^plot-[0-9a-f-]{36}$/);
	});

	it('gives a new id on each call', () => {
		expect(Utils.createId('sq')).not.toBe(Utils.createId('sq'));
	});
});
