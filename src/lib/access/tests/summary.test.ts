import { describe, expect, it } from 'vitest';
import type { AuthRole, AuthRule, AuthUser } from '@maris-development/beacon-client';
import { translate } from '@/i18n';
import {
	accessSummary,
	describeTarget,
	filterRoles,
	filterUsers,
	initials,
	membersOf,
	publicAccess,
	rolesToAdd,
	ruleCount,
	sortUsers,
	targetOf,
	totals,
	usersToAdd
} from '../summary';

const all: AuthRule = { privilege: 'SELECT', target_type: 'all', target_value: null };

function user(username: string, roles: string[], flags: Partial<AuthUser> = {}): AuthUser {
	return { username, roles, is_super_user: false, is_anonymous: false, ...flags };
}

function role(name: string, grants: AuthRule[], denies: AuthRule[]): AuthRole {
	return { name, grants, denies };
}

describe('accessSummary', () => {
	it('gives full access to the super-user', () => {
		expect(translate(accessSummary(user('admin', [], { is_super_user: true }), []).label)).toBe('Full access');
	});
	it('gives no access without roles', () => {
		const s = accessSummary(user('jane', []), []);
		expect([s.tone, translate(s.line)]).toEqual(['none', 'The user has no role']);
	});
	it('gives no access with roles but no grant', () => {
		expect(translate(accessSummary(user('jane', ['r']), [role('r', [], [all])]).line)).toBe(
			'The roles have no grant rules'
		);
	});
	it('counts a missing role as a role with no rules', () => {
		expect(accessSummary(user('jane', ['gone']), []).tone).toBe('none');
	});
	it('gives all data through a grant on all and no deny', () => {
		const s = accessSummary(user('jane', ['a', 'b']), [role('a', [all], []), role('b', [], [])]);
		expect([s.tone, translate(s.line)]).toEqual(['all', 'Through a, b']);
	});
	it('gives limited access to a grant on all plus a deny', () => {
		const deny = { privilege: 'SELECT', target_type: 'table', target_value: 'secret' } as const;
		const s = accessSummary(user('jane', ['a']), [role('a', [all], [deny])]);
		expect([s.tone, translate(s.line)]).toEqual(['limited', '1 grant · 1 deny']);
	});
	it('gives limited access to a grant on a table only', () => {
		const table = { privilege: 'SELECT', target_type: 'table', target_value: 't' } as const;
		expect(accessSummary(user('jane', ['a']), [role('a', [table], [])]).tone).toBe('limited');
	});
});

describe('publicAccess', () => {
	it('reads the public access from the anonymous user', () => {
		const roles = [role('pub', [all], [])];
		expect(translate(publicAccess([user('anonymous', ['pub'], { is_anonymous: true })], roles))).toBe('All data');
		expect(translate(publicAccess([user('admin', [], { is_super_user: true })], roles))).toBe('Off');
	});
});

describe('lists', () => {
	const users = [
		user('admin', [], { is_super_user: true }),
		user('anonymous', [], { is_anonymous: true }),
		user('jane', ['a'])
	];

	it('counts the totals', () => {
		expect(totals(users, [role('a', [all], []), role('b', [], [all])])).toEqual({
			users: 3,
			localUsers: 1,
			roles: 2,
			usersWithRole: 1,
			grants: 1,
			denies: 1
		});
	});
	it('counts the rules of a role', () => {
		expect(ruleCount(role('a', [all], [all, all]))).toBe(3);
	});
	it('lists the members of a role', () => {
		expect(membersOf('a', users).map((u) => u.username)).toEqual(['jane']);
	});
	it('leaves the super-user out of usersToAdd', () => {
		expect(usersToAdd('a', users).map((u) => u.username)).toEqual(['anonymous']);
	});
	it('lists the roles to add by name', () => {
		const roles = [role('z', [], []), role('a', [], []), role('m', [], [])];
		expect(rolesToAdd(user('jane', ['m']), roles).map((r) => r.name)).toEqual(['a', 'z']);
	});
	it('sorts the super-user, then anonymous, then by name', () => {
		const list = [
			user('zed', []),
			user('anonymous', [], { is_anonymous: true }),
			user('admin', [], { is_super_user: true }),
			user('amy', [])
		];
		expect(sortUsers(list).map((u) => u.username)).toEqual(['admin', 'anonymous', 'amy', 'zed']);
	});
	it('filters users on the name or a role name', () => {
		const list = [user('banana', []), user('jane', ['analysts']), user('bob', ['x'])];
		expect(filterUsers(list, 'ANA').map((u) => u.username)).toEqual(['banana', 'jane']);
		expect(filterUsers(list, '')).toHaveLength(3);
	});
	it('filters roles on the name', () => {
		const list = [role('Analysts', [], []), role('ops', [], [])];
		expect(filterRoles(list, 'ana').map((r) => r.name)).toEqual(['Analysts']);
		expect(filterRoles(list, '')).toHaveLength(2);
	});
});

describe('initials', () => {
	it.each([
		['jane_doe', 'JD'],
		['admin', 'AD'],
		['a.b-c', 'AB']
	])('initials of %s', (name, out) => expect(initials(name)).toBe(out));
});

describe('targets', () => {
	it('reads a null target value as empty', () => {
		expect(targetOf({ privilege: 'SELECT', target_type: 'table', target_value: null })).toEqual({
			type: 'table',
			value: ''
		});
	});
	it('reads an all target', () => {
		expect(targetOf(all)).toEqual({ type: 'all' });
	});
	it('describes the targets', () => {
		expect(translate(describeTarget({ type: 'all' }))).toBe('all data');
		expect(translate(describeTarget({ type: 'table', value: 't' }))).toBe('TABLE t');
		expect(translate(describeTarget({ type: 'path', value: 'a/**' }))).toBe('PATH a/**');
	});
});
