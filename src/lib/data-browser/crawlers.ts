import { normalizeFolder } from './folders';

export const CRAWLER_FORMATS = [
	{ value: 'parquet', label: 'Parquet' },
	{ value: 'nc', label: 'NetCDF' },
	{ value: 'csv', label: 'CSV' },
	{ value: 'zarr', label: 'Zarr' },
	{ value: 'atlas', label: 'Atlas' },
	{ value: 'arrow', label: 'Arrow' },
	{ value: 'odv', label: 'ODV' },
	{ value: 'tiff', label: 'GeoTIFF' },
	{ value: 'bbf', label: 'BBF' }
];

export type TableNaming = 'leaf_prefix' | 'crawler_prefixed';

export interface Crawler {
	name: string;
	targetPrefix: string;
	/** `null` means every format. */
	formatFilter: string[] | null;
	tableNaming: TableNaming;
	detectPartitions: boolean;
	/** `null` means only on Run. */
	scheduleSecs: number | null;
	/** The server does not use it yet. The form keeps it on Edit. */
	eventDriven: boolean;
	options: Record<string, string>;
}

/** Reads `GET /api/admin/crawlers`. */
export function parseCrawlers(raw: unknown): Crawler[] {
	if (!Array.isArray(raw)) return [];

	const result: Crawler[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;

		const record = item as Record<string, unknown>;
		if (typeof record.name !== 'string' || typeof record.target_prefix !== 'string') continue;

		let formatFilter: string[] | null = null;
		if (Array.isArray(record.format_filter)) {
			formatFilter = record.format_filter.filter(
				(value): value is string => typeof value === 'string'
			);
		}

		let tableNaming: TableNaming = 'leaf_prefix';
		if (record.table_naming === 'crawler_prefixed') tableNaming = 'crawler_prefixed';

		let scheduleSecs: number | null = null;
		if (typeof record.schedule_secs === 'number') scheduleSecs = record.schedule_secs;

		const options: Record<string, string> = {};
		if (record.options && typeof record.options === 'object') {
			for (const [key, value] of Object.entries(record.options as Record<string, unknown>)) {
				options[key] = String(value);
			}
		}

		result.push({
			name: record.name,
			targetPrefix: record.target_prefix,
			formatFilter,
			tableNaming,
			detectPartitions: record.detect_partitions !== false,
			scheduleSecs,
			eventDriven: record.event_driven === true,
			options
		});
	}

	return result;
}

export type ScheduleUnit = 'seconds' | 'minutes' | 'hours';

export interface CrawlerForm {
	name: string;
	folder: string;
	formats: string[];
	naming: TableNaming;
	detectPartitions: boolean;
	scheduled: boolean;
	every: number;
	unit: ScheduleUnit;
	options: { key: string; value: string }[];
	eventDriven: boolean;
}

export function emptyCrawlerForm(): CrawlerForm {
	return {
		name: '',
		folder: '',
		formats: [],
		naming: 'leaf_prefix',
		detectPartitions: true,
		scheduled: false,
		every: 1,
		unit: 'hours',
		options: [],
		eventDriven: false
	};
}

// The form shows hours or minutes when the value divides, else seconds, so a save keeps the value.
export function formFromCrawler(crawler: Crawler): CrawlerForm {
	let scheduled = false;
	let every = 1;
	let unit: ScheduleUnit = 'hours';

	if (crawler.scheduleSecs !== null && crawler.scheduleSecs > 0) {
		scheduled = true;
		if (crawler.scheduleSecs % 3600 === 0) {
			every = crawler.scheduleSecs / 3600;
		} else if (crawler.scheduleSecs % 60 === 0) {
			unit = 'minutes';
			every = crawler.scheduleSecs / 60;
		} else {
			unit = 'seconds';
			every = crawler.scheduleSecs;
		}
	}

	return {
		name: crawler.name,
		folder: crawler.targetPrefix,
		formats: crawler.formatFilter ?? [],
		naming: crawler.tableNaming,
		detectPartitions: crawler.detectPartitions,
		scheduled,
		every,
		unit,
		options: Object.entries(crawler.options).map(([key, value]) => ({ key, value })),
		eventDriven: crawler.eventDriven
	};
}

/** The body of `POST /api/admin/crawlers`. */
export function crawlerRequest(form: CrawlerForm, replace: boolean): Record<string, unknown> {
	let formatFilter: string[] | null = null;
	if (form.formats.length > 0) formatFilter = form.formats;

	let scheduleSecs: number | null = null;
	if (form.scheduled) {
		let factor = 3600;
		if (form.unit === 'minutes') factor = 60;
		if (form.unit === 'seconds') factor = 1;
		scheduleSecs = form.every * factor;
	}

	const options: Record<string, string> = {};
	for (const option of form.options) {
		if (option.key.trim() !== '') options[option.key.trim()] = option.value;
	}

	return {
		name: form.name.trim(),
		target_prefix: normalizeFolder(form.folder),
		format_filter: formatFilter,
		table_naming: form.naming,
		detect_partitions: form.detectPartitions,
		schedule_secs: scheduleSecs,
		event_driven: form.eventDriven,
		options,
		replace
	};
}

export function crawlerErrors(form: CrawlerForm): string[] {
	const errors: string[] = [];

	if (form.name.trim() === '') errors.push('Enter a crawler name.');
	if (normalizeFolder(form.folder) === '') errors.push('Pick a folder.');
	if (form.scheduled && (!Number.isInteger(form.every) || form.every < 1)) {
		errors.push('Enter a schedule of at least 1.');
	} else if (form.scheduled && form.unit === 'seconds' && form.every < 60) {
		// Each run scans the whole folder, so a shorter period loads the node for nothing.
		errors.push('Enter a schedule of at least 60 seconds.');
	}

	return errors;
}

export function describeSchedule(secs: number | null): string {
	if (secs === null || secs <= 0) return 'Only on Run';
	if (secs === 3600) return 'Every hour';
	if (secs % 3600 === 0) return `Every ${secs / 3600} hours`;
	if (secs === 60) return 'Every minute';
	if (secs % 60 === 0) return `Every ${secs / 60} minutes`;
	return `Every ${secs} seconds`;
}

export function describeFormats(filter: string[] | null): string {
	if (filter === null || filter.length === 0) return 'All formats';

	return filter
		.map((value) => CRAWLER_FORMATS.find((format) => format.value === value)?.label ?? value)
		.join(', ');
}

export function describeNaming(naming: TableNaming): string {
	if (naming === 'crawler_prefixed') return 'Crawler name + folder name';
	return 'Folder name';
}

/** The name of a table from the chosen folder. The crawler uses each sub-folder the same way. */
export function tableNameExample(form: CrawlerForm): string {
	const parts = normalizeFolder(form.folder)
		.split('/')
		.filter((part) => part !== '');
	const leaf = parts[parts.length - 1] ?? '<folder>';

	if (form.naming === 'crawler_prefixed') return `${form.name.trim() || '<crawler>'}_${leaf}`;
	return leaf;
}

/** A cut list can miss the folder, so it counts as "has files". */
export function folderHasFiles(folder: string, paths: string[], listCut = false): boolean {
	if (listCut) return true;

	const prefix = normalizeFolder(folder);
	return paths.some((path) => path.replace(/^\/+/, '').startsWith(prefix));
}
