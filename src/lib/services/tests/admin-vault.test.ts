import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { RememberedSecret } from '../admin-vault';

const DB_NAME = 'beacon-studio.admin-vault';

function entry(nodeId: string, secret = 'pw'): RememberedSecret {
	return {
		nodeId,
		nodeUrl: `https://${nodeId}.example.org`,
		username: 'alice',
		kind: 'password',
		secret
	};
}

async function load() {
	vi.resetModules();
	return await import('../admin-vault');
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function openRaw(): Promise<IDBDatabase> {
	return request(indexedDB.open(DB_NAME));
}

type Raw = { nodeId: string; ciphertext: ArrayBuffer; [field: string]: unknown };

async function readAll<T = Raw>(store: string): Promise<T[]> {
	const db = await openRaw();
	try {
		return (await request(db.transaction(store).objectStore(store).getAll())) as T[];
	} finally {
		db.close();
	}
}

async function rewrite(nodeId: string, change: (record: Raw) => Raw, newKey?: string) {
	const db = await openRaw();
	try {
		const store = db.transaction('entries', 'readwrite').objectStore('entries');
		const record = await request(store.get(nodeId));
		if (newKey) {
			store.delete(nodeId);
		}
		await request(store.put(change(record)));
	} finally {
		db.close();
	}
}

describe('admin-vault', () => {
	beforeEach(() => {
		vi.stubGlobal('indexedDB', new IDBFactory());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips an entry', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		expect(await vault.loadRemembered()).toEqual([entry('a')]);
	});

	it('replaces the entry of the same node', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a', 'pw1'));
		await vault.saveRemembered(entry('a', 'pw2'));
		expect(await vault.loadRemembered()).toEqual([entry('a', 'pw2')]);
	});

	it('stores no plain secret', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a', 's3cret-pw'));
		const records = [...(await readAll('entries')), ...(await readAll('keys'))];
		expect(records.length).toBeGreaterThan(0);
		for (const record of records) {
			expect(JSON.stringify(record)).not.toContain('s3cret-pw');
		}
		const stored = (await readAll('entries'))[0];
		const text = new TextDecoder().decode(new Uint8Array(stored.ciphertext));
		expect(text).not.toContain('s3cret-pw');
	});

	it('keeps the key non-extractable', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		const [key] = await readAll<CryptoKey>('keys');
		expect(key.extractable).toBe(false);
		await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
	});

	it('drops an entry that does not decrypt', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		await vault.saveRemembered(entry('b'));
		await rewrite('a', (record) => {
			const bytes = new Uint8Array(record.ciphertext);
			bytes[0] ^= 1;
			return { ...record, ciphertext: bytes.buffer };
		});
		expect(await vault.loadRemembered()).toEqual([entry('b')]);
		const left = await readAll('entries');
		expect(left.map((record) => record.nodeId)).toEqual(['b']);
	});

	it('drops an entry moved to another node', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		await rewrite('a', (record) => ({ ...record, nodeId: 'b' }), 'b');
		expect(await vault.loadRemembered()).toEqual([]);
	});

	it('drops an entry with a changed kind', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		await rewrite('a', (record) => ({ ...record, kind: 'session-token' }));
		expect(await vault.loadRemembered()).toEqual([]);
	});

	it('forgets one node', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		await vault.saveRemembered(entry('b'));
		await vault.forgetRemembered('a');
		expect(await vault.loadRemembered()).toEqual([entry('b')]);
	});

	it('forgets all', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		await vault.forgetAllRemembered();
		expect(await vault.loadRemembered()).toEqual([]);
		await vault.saveRemembered(entry('c'));
		expect(await vault.loadRemembered()).toEqual([entry('c')]);
	});

	it('forgets all after an open connection closes', async () => {
		const vault = await load();
		await vault.saveRemembered(entry('a'));
		const open = await openRaw();
		let settled = false;

		const forgetting = vault.forgetAllRemembered().finally(() => (settled = true));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(settled).toBe(false);
		open.close();

		await expect(forgetting).resolves.toBeUndefined();
		expect(await vault.loadRemembered()).toEqual([]);
	});

	it('reports no vault without IndexedDB', async () => {
		vi.stubGlobal('indexedDB', undefined);
		const vault = await load();
		expect(vault.vaultAvailable()).toBe(false);
		expect(await vault.loadRemembered()).toEqual([]);
	});
});
