import { describe, expect, it } from 'vitest';
import { backTarget, withBack } from '../back';

const fallback = '/data-browser/data-tables';

describe('backTarget', () => {
	it('uses a list URL with its parameters', () => {
		expect(backTarget('/data-browser/datasets?folder=argo%2F&page=2', '', fallback)).toBe(
			'/data-browser/datasets?folder=argo%2F&page=2'
		);
	});

	it('accepts the data-browser root itself', () => {
		expect(backTarget('/data-browser', '', fallback)).toBe('/data-browser');
		expect(backTarget('/data-browser?x=1', '', fallback)).toBe('/data-browser?x=1');
	});

	it('respects the base path', () => {
		expect(backTarget('/studio/data-browser/data-tables', '/studio', fallback)).toBe(
			'/studio/data-browser/data-tables'
		);
		expect(backTarget('/data-browser/data-tables', '/studio', fallback)).toBe(fallback);
	});

	it('falls back for no value', () => {
		expect(backTarget(null, '', fallback)).toBe(fallback);
		expect(backTarget('', '', fallback)).toBe(fallback);
	});

	it('falls back for a value that leaves the data browser or the site', () => {
		for (const bad of [
			'https://evil.example/data-browser',
			'//evil.example/data-browser',
			'/data-browserx',
			'/queries/history',
			'javascript:alert(1)',
			'/data-browser\\..\\x',
			'data-browser/data-tables'
		]) {
			expect(backTarget(bad, '', fallback)).toBe(fallback);
		}
	});
});

describe('withBack', () => {
	it('adds back to a URL with no parameters', () => {
		expect(withBack('/data-browser/data-tables/detail', '/data-browser/data-tables?q=a')).toBe(
			'/data-browser/data-tables/detail?back=%2Fdata-browser%2Fdata-tables%3Fq%3Da'
		);
	});

	it('adds back to a URL with parameters', () => {
		expect(withBack('/d?table_name=t', '/l')).toBe('/d?table_name=t&back=%2Fl');
	});
});
