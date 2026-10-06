import { describe, expect, it } from 'vitest';
import { ApiError, ConnectionError } from '@maris-development/beacon-client';
import { isSqlDisabled, isSuperUserRefusal, sqlErrorMessage, sqlToRun } from '../statement';

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

describe('sqlErrorMessage', () => {
	it('shows the server text', () => {
		expect(sqlErrorMessage(new ApiError(400, 'column "x" not found', 'u'))).toBe(
			'column "x" not found'
		);
	});

	it('names the status when the body is empty', () => {
		expect(sqlErrorMessage(new ApiError(502, '', 'u'))).toBe(
			'The Beacon node answered with status 502.'
		);
	});

	it('names a connection failure', () => {
		expect(sqlErrorMessage(new ConnectionError('u', null))).toBe(
			'The Beacon node cannot be reached.'
		);
	});

	it('shows any other error message', () => {
		expect(sqlErrorMessage(new Error('boom'))).toBe('boom');
		expect(sqlErrorMessage('text')).toBe('text');
	});
});
