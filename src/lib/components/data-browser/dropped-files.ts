export type PickedFile = { file: File; relativePath: string };

/** Files from an `<input type="file">`. A folder pick fills `webkitRelativePath`. */
export function filesFromInput(list: FileList): PickedFile[] {
	return Array.from(list).map((file) => ({
		file,
		relativePath: file.webkitRelativePath || file.name
	}));
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, prefix: string, out: PickedFile[]): Promise<void> {
	if (entry.isFile) {
		out.push({
			file: await fileOf(entry as FileSystemFileEntry),
			relativePath: `${prefix}${entry.name}`
		});
		return;
	}

	const reader = (entry as FileSystemDirectoryEntry).createReader();
	// `readEntries` returns at most 100 entries per call, so it runs until it returns none.
	for (;;) {
		const batch = await readEntries(reader);
		if (batch.length === 0) break;
		for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
	}
}

/** Files and folders dropped on the dialog, with the folder path kept. */
export async function filesFromDrop(event: DragEvent): Promise<PickedFile[]> {
	const items = event.dataTransfer?.items;
	if (!items) return [];

	const entries = Array.from(items)
		.map((item) => item.webkitGetAsEntry())
		.filter((entry): entry is FileSystemEntry => entry !== null);

	const out: PickedFile[] = [];
	for (const entry of entries) await walk(entry, '', out);

	return out;
}
