/**
 * The admin sign-in of each Beacon node.
 *
 * A session holds the Basic auth credentials of one node. The app keeps them in
 * `sessionStorage`, so they go away when the tab closes. A remembered session is
 * also in the encrypted vault (`admin-vault.ts`), and comes back after a restart.
 * A session on one node gives no rights on another node.
 */

import { derived, get, readonly, writable, type Readable } from "svelte/store";
import { ApiError, BeaconClient, ConnectionError } from "@maris-development/beacon-client";
import type { BeaconNode } from "@/beacon-api/types";
import { translate } from "@/i18n";
import { normalizeUrl } from "./beacon-node-url";
import {
    forgetAllRemembered,
    forgetRemembered,
    loadRemembered,
    saveRemembered,
    vaultAvailable,
    type RememberedSecret
} from "./admin-vault";

export type AdminCredentials = { username: string; password: string };

/** A tab session. `url` is the normalized URL of the node at the sign-in. */
type StoredSession = AdminCredentials & { url: string };

type Sessions = Record<string, StoredSession>;

const STORAGE_KEY = "beacon-studio.admin-sessions";

/** The credentials were wrong. The dialog shows this, and stays open. */
export class AdminAuthError extends Error {
    constructor() {
        super(translate("admin.signIn.wrongCredentials"));
        this.name = "AdminAuthError";
    }
}

function isStoredSession(value: unknown): value is StoredSession {
    if (!value || typeof value !== "object") return false;

    const session = value as Record<string, unknown>;
    return (
        typeof session.username === "string" &&
        typeof session.password === "string" &&
        typeof session.url === "string"
    );
}

function readStorage(): Sessions {
    try {
        const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};

        // An entry without a URL is an old shape. It is a cache, so it drops.
        const result: Sessions = {};
        for (const [nodeId, value] of Object.entries(parsed)) {
            if (isStoredSession(value)) result[nodeId] = value;
        }
        return result;
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

type SessionNode = { id: string; url: string };

// Another tab can change the URL of a node, so a session for another URL signs out.
function sessionFor(node: SessionNode): StoredSession | null {
    const session = get(sessions)[node.id];
    if (!session) return null;

    if (session.url !== normalizeUrl(node.url)) {
        signOut(node.id);
        return null;
    }

    return session;
}

/** The credentials of this node at its current URL, or null. */
export function credentialsOf(node: SessionNode): AdminCredentials | null {
    const session = sessionFor(node);
    if (!session) return null;

    return { username: session.username, password: session.password };
}

/** An SDK client with Basic auth. The bearer token of the node shares the header, so it stays out. */
export function makeAdminClient(
    node: { url: string; token?: string },
    credentials: AdminCredentials
): BeaconClient {
    return new BeaconClient({
        url: normalizeUrl(node.url),
        username: credentials.username,
        password: credentials.password,
        timeoutMs: 0
    });
}

/** Checks the credentials with the node at this URL. Saves nothing. */
export async function checkAdminCredentials(
    url: string,
    credentials: AdminCredentials
): Promise<void> {
    const client = makeAdminClient({ url }, credentials);

    try {
        await client.admin.check();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw new AdminAuthError();
        throw error;
    }
}

/** Resolves when the restore of the remembered sessions ends. Admin actions wait for it. */
export let adminSessionsReady: Promise<void> = Promise.resolve();

let restoresRunning = 0;

// A sign-in or sign-out during a restore wins over the remembered entry.
const touchedDuringRestore = new Set<string>();

function touch(nodeId: string): void {
    if (restoresRunning > 0) touchedDuringRestore.add(nodeId);
}

const vaultQueue = new Map<string, Promise<void>>();

// Vault writes of one node run in call order, so a later sign-out wins over an earlier save.
function queueVault<T>(nodeId: string, write: () => Promise<T>): Promise<T> {
    const result = (vaultQueue.get(nodeId) ?? Promise.resolve()).then(write);
    const tail = result.then(
        () => {},
        () => {}
    );

    vaultQueue.set(nodeId, tail);
    void tail.then(() => {
        if (vaultQueue.get(nodeId) === tail) vaultQueue.delete(nodeId);
    });

    return result;
}

function forgetQuietly(nodeId: string): Promise<void> {
    return queueVault(nodeId, () => forgetRemembered(nodeId)).catch((error) => {
        console.warn("Cannot forget the remembered admin sign-in", error);
    });
}

/** True when this browser can remember a sign-in. */
export function canRememberSignIn(): boolean {
    return vaultAvailable();
}

/**
 * Checks the credentials with the node, and saves them on success.
 * Resolves false only when `remember` is set and the vault save failed. The tab session exists then too.
 */
export async function signIn(
    node: BeaconNode,
    username: string,
    password: string,
    remember = false
): Promise<boolean> {
    await checkAdminCredentials(node.url, { username, password });

    const url = normalizeUrl(node.url);

    touch(node.id);
    sessions.update((value) => ({ ...value, [node.id]: { username, password, url } }));

    if (!remember) {
        void forgetQuietly(node.id);
        return true;
    }

    try {
        const entry: RememberedSecret = {
            nodeId: node.id,
            nodeUrl: url,
            username,
            kind: "password",
            secret: password
        };
        await queueVault(node.id, () => saveRemembered(entry));
        return true;
    } catch (error) {
        console.warn("Cannot remember the admin sign-in", error);
        return false;
    }
}

export function signOut(nodeId: string): void {
    touch(nodeId);
    sessions.update((value) => {
        if (!(nodeId in value)) return value;

        const next = { ...value };
        delete next[nodeId];
        return next;
    });

    void forgetQuietly(nodeId);
}

/** Forgets every remembered sign-in. The open tab sessions stay. */
export async function forgetAllAdminSignIns(): Promise<void> {
    // A pending save then cannot write its entry after the delete.
    await Promise.all(vaultQueue.values());
    await forgetAllRemembered();
}

// The one place that maps a vault secret to credentials.
function credentialsFromSecret(entry: RememberedSecret): AdminCredentials | null {
    if (entry.kind !== "password") return null;

    return { username: entry.username, password: entry.secret };
}

function urlMatches(entry: RememberedSecret, nodeUrl: string | null): boolean {
    if (nodeUrl === null) return false;

    try {
        return normalizeUrl(nodeUrl) === entry.nodeUrl;
    } catch {
        return false;
    }
}

async function restore(nodeUrlOf: (nodeId: string) => string | null): Promise<void> {
    restoresRunning += 1;

    try {
        const restored: Sessions = {};

        for (const entry of await loadRemembered()) {
            const credentials = credentialsFromSecret(entry);

            if (credentials && urlMatches(entry, nodeUrlOf(entry.nodeId))) {
                restored[entry.nodeId] = { ...credentials, url: entry.nodeUrl };
            } else if (!touchedDuringRestore.has(entry.nodeId)) {
                await forgetQuietly(entry.nodeId);
            }
        }

        sessions.update((value) => {
            const next = { ...value };
            for (const [nodeId, session] of Object.entries(restored)) {
                if (!(nodeId in next) && !touchedDuringRestore.has(nodeId)) next[nodeId] = session;
            }
            return next;
        });
    } catch (error) {
        console.warn("Cannot restore the remembered admin sign-ins", error);
    } finally {
        restoresRunning -= 1;
        if (restoresRunning === 0) touchedDuringRestore.clear();
    }
}

/**
 * Puts the remembered sessions back. `nodeUrlOf` gives the current URL of a node, or null.
 * An entry for a missing node or another URL is removed. Never rejects.
 */
export function restoreRememberedSessions(
    nodeUrlOf: (nodeId: string) => string | null
): Promise<void> {
    const running = restore(nodeUrlOf);
    adminSessionsReady = running;
    return running;
}

/** A message for a toast after a failed admin action. */
export function adminErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 403) return translate("admin.error.forbidden");
        return error.body || translate("admin.error.status", { status: error.status });
    }

    if (error instanceof ConnectionError) return translate("admin.error.unreachable");
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
    await adminSessionsReady;

    let session = sessionFor(node);

    if (!session) {
        if (!(await askSignIn(node))) return null;
        session = sessionFor(node);
    }

    if (!session) return null;

    return makeAdminClient(node, session);
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

    const used = get(sessions)[node.id];

    try {
        return await fn(client);
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }

    // Another action can have signed in again while this one ran.
    if (get(sessions)[node.id] === used) signOut(node.id);

    const retry = await requireAdminClient(node);
    if (!retry) return null;

    return fn(retry);
}

/**
 * Runs one admin action with the current session only. It never asks for a sign-in.
 * Null means no session. A 401 removes the session and also gives null.
 */
export async function withAdminSession<T>(
    node: BeaconNode,
    fn: (client: BeaconClient) => Promise<T>
): Promise<T | null> {
    await adminSessionsReady;

    const used = sessionFor(node);
    if (!used) return null;

    try {
        return await fn(makeAdminClient(node, used));
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }

    // Another action can have signed in again while this one ran.
    if (get(sessions)[node.id] === used) signOut(node.id);

    return null;
}

export type AdminPageState = "pick-node" | "sign-in" | "ready";

/** What an admin-only page shows for the selected node. The layout renders pages after the restore. */
export function adminPageState(
    node: BeaconNode | null,
    signedIn: ReadonlySet<string>
): AdminPageState {
    if (!node) return "pick-node";
    if (signedIn.has(node.id)) return "ready";

    return "sign-in";
}
