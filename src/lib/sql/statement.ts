import { ApiError, ConnectionError } from '@maris-development/beacon-client';
import { message, type Message } from '@/i18n';

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

/** A server error text stays raw, inside `sqlEditor.error.raw`. */
export function sqlError(error: unknown): Message {
	if (error instanceof ApiError) {
		if (error.body) return message('sqlEditor.error.raw', { text: error.body });
		return message('admin.error.status', { status: error.status });
	}

	if (error instanceof ConnectionError) return message('admin.error.unreachable');
	if (error instanceof Error) return message('sqlEditor.error.raw', { text: error.message });

	return message('sqlEditor.error.raw', { text: String(error) });
}
