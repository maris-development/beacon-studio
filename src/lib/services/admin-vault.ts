/**
 * Encrypted storage for remembered admin sign-ins.
 *
 * IndexedDB holds one non-extractable AES-GCM key and one encrypted entry for each node.
 * The vault knows nothing about sessions. A format change bumps `VAULT_VERSION`.
 */

const DB_NAME = 'beacon-studio.admin-vault';
const KEYS = 'keys';
const ENTRIES = 'entries';
const KEY_ID = 'device';

export const VAULT_VERSION = 1;

export type SecretKind = 'password';

export type RememberedSecret = {
	nodeId: string;
	nodeUrl: string;
	username: string;
	kind: SecretKind;
	secret: string;
};

type StoredEntry = {
	nodeId: string;
	nodeUrl: string;
	username: string;
	kind: SecretKind;
	iv: Uint8Array;
	ciphertext: ArrayBuffer;
};

export function vaultAvailable(): boolean {
	return typeof indexedDB !== 'undefined' && !!globalThis.crypto?.subtle;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, VAULT_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			// A new format version discards every old store.
			for (const name of Array.from(db.objectStoreNames)) {
				db.deleteObjectStore(name);
			}
			db.createObjectStore(KEYS);
			db.createObjectStore(ENTRIES, { keyPath: 'nodeId' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('Vault database is blocked'));
	});
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
	const db = await openDb();
	try {
		return await fn(db);
	} finally {
		db.close();
	}
}

// The ciphertext binds to node, URL and kind, so a copied entry fails to decrypt.
function boundData(nodeId: string, nodeUrl: string, kind: string): Uint8Array {
	return new TextEncoder().encode(`${nodeId}\n${nodeUrl}\n${kind}`);
}

async function getOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
	const existing = await wrap<CryptoKey | undefined>(
		db.transaction(KEYS).objectStore(KEYS).get(KEY_ID)
	);
	if (existing) {
		return existing;
	}
	const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
		'encrypt',
		'decrypt'
	]);
	const tx = db.transaction(KEYS, 'readwrite');
	tx.objectStore(KEYS).put(key, KEY_ID);
	await done(tx);
	return key;
}

export async function saveRemembered(entry: RememberedSecret): Promise<void> {
	if (!vaultAvailable()) {
		throw new Error('Vault is not available');
	}
	await withDb(async (db) => {
		const key = await getOrCreateKey(db);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ciphertext = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv,
				additionalData: boundData(entry.nodeId, entry.nodeUrl, entry.kind) as BufferSource
			},
			key,
			new TextEncoder().encode(entry.secret)
		);
		const stored: StoredEntry = {
			nodeId: entry.nodeId,
			nodeUrl: entry.nodeUrl,
			username: entry.username,
			kind: entry.kind,
			iv,
			ciphertext
		};
		const tx = db.transaction(ENTRIES, 'readwrite');
		tx.objectStore(ENTRIES).put(stored);
		await done(tx);
	});
}

async function decrypt(key: CryptoKey, stored: StoredEntry): Promise<RememberedSecret> {
	const plain = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: stored.iv as BufferSource,
			additionalData: boundData(stored.nodeId, stored.nodeUrl, stored.kind) as BufferSource
		},
		key,
		stored.ciphertext
	);
	return {
		nodeId: stored.nodeId,
		nodeUrl: stored.nodeUrl,
		username: stored.username,
		kind: stored.kind,
		secret: new TextDecoder().decode(plain)
	};
}

export async function loadRemembered(): Promise<RememberedSecret[]> {
	if (!vaultAvailable()) {
		return [];
	}
	try {
		return await withDb(async (db) => {
			const stored = await wrap<StoredEntry[]>(
				db.transaction(ENTRIES).objectStore(ENTRIES).getAll()
			);
			if (stored.length === 0) {
				return [];
			}
			const key = await wrap<CryptoKey | undefined>(
				db.transaction(KEYS).objectStore(KEYS).get(KEY_ID)
			);
			const result: RememberedSecret[] = [];
			const broken: string[] = [];
			for (const item of stored) {
				try {
					if (!key) {
						throw new Error('No key');
					}
					result.push(await decrypt(key, item));
				} catch {
					broken.push(item.nodeId);
				}
			}
			if (broken.length > 0) {
				const tx = db.transaction(ENTRIES, 'readwrite');
				for (const nodeId of broken) {
					tx.objectStore(ENTRIES).delete(nodeId);
				}
				await done(tx);
			}
			return result;
		});
	} catch {
		return [];
	}
}

export async function forgetRemembered(nodeId: string): Promise<void> {
	if (!vaultAvailable()) {
		return;
	}
	await withDb(async (db) => {
		const tx = db.transaction(ENTRIES, 'readwrite');
		tx.objectStore(ENTRIES).delete(nodeId);
		await done(tx);
	});
}

export async function forgetAllRemembered(): Promise<void> {
	if (typeof indexedDB === 'undefined') {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const req = indexedDB.deleteDatabase(DB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
		// A blocked delete still completes when the open connections close.
	});
}
