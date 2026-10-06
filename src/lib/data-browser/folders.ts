/** A folder as the datasets store names it: no leading `/`, a trailing `/`, empty for the root. */
export function normalizeFolder(folder: string): string {
	const cleaned = folder
		.trim()
		.replace(/\/{2,}/g, '/')
		.replace(/^\/+/, '');
	if (cleaned === '' || cleaned === '/') return '';
	if (cleaned.endsWith('/')) return cleaned;

	return `${cleaned}/`;
}

/** Every folder that holds a file, at any depth. */
export function allFolders(paths: string[]): string[] {
	const folders = new Set<string>();

	for (const path of paths) {
		const parts = path.split('/').slice(0, -1);
		let folder = '';

		for (const part of parts) {
			if (part === '') continue;
			folder += `${part}/`;
			folders.add(folder);
		}
	}

	return [...folders].sort();
}
