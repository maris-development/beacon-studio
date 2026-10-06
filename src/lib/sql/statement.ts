import { ApiError, ConnectionError } from '@maris-development/beacon-client';

const SUPER_USER_TEXT = 'requires super-user privileges';
const SQL_DISABLED_TEXT = 'SQL queries are not enabled';

/** The selection when it holds text, otherwise the full tab text. */
export function sqlToRun(text: string, selected: string): string {
	if (selected.trim() !== '') return selected.trim();

	return text.trim();
}

// The server sends both refusals as a 400 with a fixed text.
function isBadRequestWith(error: unknown, text: string): boolean {
	return error instanceof ApiError && error.status === 400 && error.body.includes(text);
}

export function isSuperUserRefusal(error: unknown): boolean {
	return isBadRequestWith(error, SUPER_USER_TEXT);
}

export function isSqlDisabled(error: unknown): boolean {
	return isBadRequestWith(error, SQL_DISABLED_TEXT);
}

export function sqlErrorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		return error.body || `The Beacon node answered with status ${error.status}.`;
	}

	if (error instanceof ConnectionError) return 'The Beacon node cannot be reached.';
	if (error instanceof Error) return error.message;

	return String(error);
}
