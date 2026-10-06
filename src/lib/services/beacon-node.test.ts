import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/utils', () => ({ Utils: { randomUUID: () => crypto.randomUUID() } }));
vi.mock('./admin-session', () => ({ signOut: vi.fn() }));

async function load() {
	vi.resetModules();
	const service = await import('./beacon-node');
	const session = await import('./admin-session');
	return { service, signOut: vi.mocked(session.signOut) };
}

describe('beacon-node admin sessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
	});

	it('signs out a removed node', async () => {
		const { service, signOut } = await load();
		const added = service.addNode({ name: 'A', url: 'https://a.example.org' });

		service.removeNode(added.id);

		expect(signOut).toHaveBeenCalledWith(added.id);
	});

	it('signs out a node with a new URL', async () => {
		const { service, signOut } = await load();
		const added = service.addNode({ name: 'A', url: 'https://a.example.org' });

		service.updateNode(added.id, { url: 'https://b.example.org' });

		expect(signOut).toHaveBeenCalledWith(added.id);
	});

	it('keeps the session when only the name changes', async () => {
		const { service, signOut } = await load();
		const added = service.addNode({ name: 'A', url: 'https://a.example.org' });

		service.updateNode(added.id, { name: 'B' });

		expect(signOut).not.toHaveBeenCalled();
	});
});
