import { describe, expect, it } from 'vitest';
import { quoteIdent, sqlName } from '../identifiers';

const defaults = { catalog: 'beacon', schema: 'public' };

describe('quoteIdent', () => {
	it('keeps a plain lower-case name bare', () => {
		expect(quoteIdent('sea_temp_2')).toBe('sea_temp_2');
	});

	it('quotes capitals, spaces and a leading digit', () => {
		expect(quoteIdent('Temp')).toBe('"Temp"');
		expect(quoteIdent('sea temp')).toBe('"sea temp"');
		expect(quoteIdent('2d')).toBe('"2d"');
	});

	it('doubles a quote inside the name', () => {
		expect(quoteIdent('a"b')).toBe('"a""b"');
	});
});

describe('sqlName', () => {
	it('gives a bare name in the default schema', () => {
		expect(sqlName({ catalog: 'beacon', schema: 'public', name: 'argo' }, defaults)).toBe('argo');
	});

	it('qualifies a name in another schema', () => {
		expect(sqlName({ catalog: 'beacon', schema: 'system', name: 'jobs' }, defaults)).toBe(
			'beacon.system.jobs'
		);
	});

	it('quotes each part when needed', () => {
		expect(sqlName({ catalog: 'Remote', schema: 'public', name: 'My Table' }, defaults)).toBe(
			'"Remote".public."My Table"'
		);
	});
});
