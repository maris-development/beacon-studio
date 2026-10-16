import { describe, expect, it } from 'vitest';
import { ApiError, ConnectionError } from '@maris-development/beacon-client';
import { translate } from '@/i18n';
import { isSqlDisabled, isSuperUserRefusal, sqlError, sqlToRun } from '../statement';

const refusal = new ApiError(
	400,
	'operation not permitted: this statement requires super-user privileges',
	'u'
);
const disabled = new ApiError(400, 'SQL queries are not enabled', 'u');

describe('sqlToRun', () => {
	it('runs the selection when there is one', () => {
		expect(sqlToRun('SELECT 1;\nSELECT 2;', ' SELECT 2; ')).toBe('SELECT 2;');
	});

	it('runs the full text with no selection', () => {
		expect(sqlToRun('  SELECT 1  ', '')).toBe('SELECT 1');
	});

	it('runs the full text when the selection is only spaces', () => {
		expect(sqlToRun('SELECT 1', '   ')).toBe('SELECT 1');
	});

	it('gives an empty string for an empty tab', () => {
		expect(sqlToRun(' \n ', '')).toBe('');
	});
});

describe('error matchers', () => {
	it('finds the super-user refusal', () => {
		expect(isSuperUserRefusal(refusal)).toBe(true);
		expect(isSqlDisabled(refusal)).toBe(false);
	});

	it('finds SQL turned off', () => {
		expect(isSqlDisabled(disabled)).toBe(true);
		expect(isSuperUserRefusal(disabled)).toBe(false);
	});

	it('ignores a 400 with other text', () => {
		const other = new ApiError(400, 'column "x" not found', 'u');
		expect(isSuperUserRefusal(other)).toBe(false);
		expect(isSqlDisabled(other)).toBe(false);
	});

	it('ignores the text on another status', () => {
		const forbidden = new ApiError(403, 'requires super-user privileges', 'u');
		expect(isSuperUserRefusal(forbidden)).toBe(false);
	});

	it('ignores a plain error', () => {
		expect(isSuperUserRefusal(new Error('requires super-user privileges'))).toBe(false);
	});
});

describe('sqlError', () => {
	it('keeps the server text raw', () => {
		expect(sqlError(new ApiError(400, 'column "x" not found', 'u'))).toEqual({
			key: 'sqlEditor.error.raw',
			values: { text: 'column "x" not found' }
		});
	});

	it('names the status when the body is empty', () => {
		expect(sqlError(new ApiError(502, '', 'u'))).toEqual({
			key: 'admin.error.status',
			values: { status: 502 }
		});
	});

	it('names a connection failure', () => {
		expect(sqlError(new ConnectionError('u', null)).key).toBe('admin.error.unreachable');
	});

	it('keeps any other error message raw', () => {
		expect(sqlError(new Error('boom')).values).toEqual({ text: 'boom' });
		expect(sqlError('text').values).toEqual({ text: 'text' });
	});
});

describe('sqlError text', () => {
	it('gives the English text', () => {
		expect(translate(sqlError(new ApiError(400, 'column "x" not found', 'u')))).toBe(
			'column "x" not found'
		);
		expect(translate(sqlError(new ApiError(502, '', 'u')))).toBe(
			'The Beacon node answered with status 502.'
		);
		expect(translate(sqlError(new ConnectionError('u', null)))).toBe(
			'The Beacon node cannot be reached.'
		);
	});
});
