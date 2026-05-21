import { openUrl } from '@tauri-apps/plugin-opener';

function isPrimaryUnmodifiedClick(event: MouseEvent): boolean {
	return event.button === 0 && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export async function openExternalLink(event: MouseEvent, url: string): Promise<void> {
	if (!isPrimaryUnmodifiedClick(event)) {
		return;
	}

	event.preventDefault();

	try {
		await openUrl(url);
	} catch {
		window.open(url, '_blank', 'noopener,noreferrer');
	}
}
