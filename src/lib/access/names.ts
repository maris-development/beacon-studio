const NamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when the server accepts the name for a user or a role. */
export function isValidName(name: string): boolean {
	return NamePattern.test(name);
}
