/**
 * The admin sign-in of each Beacon node.
 *
 * A session holds the Basic auth credentials of one node. The app keeps them in
 * `sessionStorage`, so they go away when the tab closes. A session on one node
 * gives no rights on another node.
 */

import { derived, get, readonly, writable, type Readable } from 'svelte/store';
import { ApiError, BeaconClient, ConnectionError } from '@maris-development/beacon-client';
import type { BeaconNode } from '@/beacon-api/types';
import { normalizeUrl } from './beacon-node-url';

export type AdminCredentials = { username: string; password: string };

type Sessions = Record<string, AdminCredentials>;

const STORAGE_KEY = 'beacon-studio.admin-sessions';

/** The credentials were wrong. The dialog shows this, and stays open. */
export class AdminAuthError extends Error {
	constructor() {
		super('Wrong username or password.');
		this.name = 'AdminAuthError';
	}
}

function readStorage(): Sessions {
	try {
		const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
		if (!raw) return {};

		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed as Sessions;
	} catch {
		// Blocked storage or bad JSON: start with no sessions.
	}

	return {};
}

function writeStorage(value: Sessions): void {
	try {
		globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// The session then lives in memory only.
	}
}

const sessions = writable<Sessions>(readStorage());
sessions.subscribe(writeStorage);

/** The ids of the nodes with a session. The password never leaves this module through it. */
export const signedInNodeIds: Readable<Set<string>> = derived(
	sessions,
	(value) => new Set(Object.keys(value))
);

export function hasAdminSession(nodeId: string): boolean {
	return nodeId in get(sessions);
}

/** Read by `requireAdminClient` only. */
export function credentialsOf(nodeId: string): AdminCredentials | null {
	return get(sessions)[nodeId] ?? null;
}

/** An SDK client with Basic auth. The bearer token of the node shares the header, so it stays out. */
export function makeAdminClient(node: BeaconNode, credentials: AdminCredentials): BeaconClient {
	return new BeaconClient({
		url: normalizeUrl(node.url),
		username: credentials.username,
		password: credentials.password,
		timeoutMs: 0
	});
}

/** Checks the credentials with the node, and saves them on success. */
export async function signIn(node: BeaconNode, username: string, password: string): Promise<void> {
	const client = makeAdminClient(node, { username, password });

	try {
		await client.admin.check();
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) throw new AdminAuthError();
		throw error;
	}

	sessions.update((value) => ({ ...value, [node.id]: { username, password } }));
}

export function signOut(nodeId: string): void {
	sessions.update((value) => {
		if (!(nodeId in value)) return value;

		const next = { ...value };
		delete next[nodeId];
		return next;
	});
}

/** A message for a toast after a failed admin action. */
export function adminErrorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.status === 403) return 'You have no permission for this action on this Beacon node.';
		return error.body || `The Beacon node answered with status ${error.status}.`;
	}

	if (error instanceof ConnectionError) return 'The Beacon node cannot be reached.';
	if (error instanceof Error) return error.message;

	return String(error);
}

/** One open sign-in question. `AdminSignInDialog` renders it. */
export interface SignInRequest {
	node: BeaconNode;
	settle: (signedIn: boolean) => void;
}

const request = writable<SignInRequest | null>(null);

export const signInRequest: Readable<SignInRequest | null> = readonly(request);

// Two actions on one node share one question.
const pending = new Map<string, Promise<boolean>>();

/**
 * Asks the dialog for a sign-in on this node. Resolves true after a sign-in.
 * A question for another node replaces this one, which then resolves false.
 */
export function askSignIn(node: BeaconNode): Promise<boolean> {
	const open = pending.get(node.id);
	if (open) return open;

	const promise = new Promise<boolean>((resolve) => {
		request.update((previous) => {
			previous?.settle(false);
			return { node, settle: resolve };
		});
	}).finally(() => pending.delete(node.id));

	pending.set(node.id, promise);
	return promise;
}

/** Closes the dialog. With `only`, a request that another one replaced is left alone. */
export function answerSignIn(signedIn: boolean, only?: SignInRequest): void {
	request.update((open) => {
		if (only && open !== only) return open;

		open?.settle(signedIn);
		return null;
	});
}

/** An admin client for this node. Asks for a sign-in first if needed. Null on cancel. */
export async function requireAdminClient(node: BeaconNode): Promise<BeaconClient | null> {
	let credentials = credentialsOf(node.id);

	if (!credentials) {
		if (!(await askSignIn(node))) return null;
		credentials = credentialsOf(node.id);
	}

	if (!credentials) return null;

	return makeAdminClient(node, credentials);
}

/**
 * Runs one admin action. A 401 removes the session, asks again and runs the
 * action one more time. Null means the user cancelled the sign-in.
 */
export async function withAdmin<T>(
	node: BeaconNode,
	fn: (client: BeaconClient) => Promise<T>
): Promise<T | null> {
	const client = await requireAdminClient(node);
	if (!client) return null;

	const used = credentialsOf(node.id);

	try {
		return await fn(client);
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 401) throw error;
	}

	// Another action can have signed in again while this one ran.
	if (credentialsOf(node.id) === used) signOut(node.id);

	const retry = await requireAdminClient(node);
	if (!retry) return null;

	return fn(retry);
}
